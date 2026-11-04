import hashlib
import importlib.util
import io
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).parents[1] / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


receiver = load('receiver', 'receive-deploy.py')
gate = load('gate', 'ssh-command.py')
COMMIT = 'a' * 40


def archive(name='backend/app/main.py', kind=tarfile.REGTYPE):
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode='w', format=tarfile.PAX_FORMAT, pax_headers={'comment': COMMIT}) as source:
        member = tarfile.TarInfo(name)
        member.type = kind
        member.linkname = '/etc/passwd'
        source.addfile(member)
    stream.seek(0)
    return stream


class DeploymentTests(unittest.TestCase):
    def test_fixed_ssh_command_rejects_shell_and_forwarding_commands(self):
        self.assertEqual(gate.parse_command('deploy ' + COMMIT + ' ' + 'b' * 64), (COMMIT, 'b' * 64))
        for value in ['', 'bash', 'id', 'deploy ' + COMMIT + ' ' + 'b' * 64 + '; id', 'deploy ../app ' + 'b' * 64]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                gate.parse_command(value)

    def test_archive_rejects_escape_links_environment_and_wrong_commit(self):
        for name, kind in [('../escape', tarfile.REGTYPE), ('/tmp/escape', tarfile.REGTYPE),
                           ('.env', tarfile.REGTYPE), ('x', tarfile.SYMTYPE), ('x', tarfile.LNKTYPE)]:
            with self.subTest(name=name, kind=kind), tempfile.TemporaryDirectory() as target, self.assertRaises(ValueError):
                receiver.extract_source(archive(name, kind), target, COMMIT)
        with tempfile.TemporaryDirectory() as target, self.assertRaises(ValueError):
            receiver.extract_source(archive(), target, 'b' * 40)

    def test_valid_archive_extracts_source(self):
        with tempfile.TemporaryDirectory() as target:
            receiver.extract_source(archive(), target, COMMIT)
            self.assertTrue((Path(target) / 'backend/app/main.py').is_file())

    def test_bad_upload_and_failed_build_preserve_running_source(self):
        for bad_checksum in [True, False]:
            with self.subTest(bad_checksum=bad_checksum), tempfile.TemporaryDirectory() as target:
                root = Path(target)
                (root / 'app').mkdir(); (root / 'app/original').write_text('running')
                (root / 'shared').mkdir(); (root / 'shared/.env').write_text('private')
                payload = archive().getvalue()
                digest = 'b' * 64 if bad_checksum else hashlib.sha256(payload).hexdigest()
                with patch.object(receiver, 'BASE', root), patch.object(receiver.subprocess, 'run',
                        side_effect=[subprocess.CompletedProcess([], 0), RuntimeError('build failed')]) as run:
                    with self.assertRaises((ValueError, RuntimeError)):
                        receiver.deploy(COMMIT, digest, io.BytesIO(payload))
                    if bad_checksum:
                        run.assert_not_called()
                    else:
                        self.assertEqual(run.call_args.args[0][-1], 'build')
                self.assertEqual((root / 'app/original').read_text(), 'running')
                self.assertEqual((root / 'shared/.env').read_text(), 'private')


if __name__ == '__main__':
    unittest.main()
