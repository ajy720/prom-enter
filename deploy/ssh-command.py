#!/usr/bin/python3
"""Installed on Proxmox as /usr/local/sbin/prom-enter-deploy, root-owned."""
import os
import re


def parse_command(command):
    match = re.fullmatch(r'deploy ([0-9a-f]{40}) ([0-9a-f]{64})', command)
    if not match:
        raise ValueError('Only the fixed Prom::Enter deployment command is allowed')
    return match.groups()


if __name__ == '__main__':
    commit, digest = parse_command(os.environ.get('SSH_ORIGINAL_COMMAND', ''))
    os.execv('/usr/sbin/pct', ['pct', 'exec', '200', '--',
                             '/usr/local/sbin/prom-enter-receive', commit, digest])
