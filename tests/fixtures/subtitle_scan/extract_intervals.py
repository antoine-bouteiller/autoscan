#!/usr/bin/env python3
"""Extract only SRT cue timings; never include dialogue in the fixture."""
import re
import sys
from pathlib import Path

TIME = re.compile(r'^\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})(?:\s|$)')


def millis(parts):
    hours, minutes, seconds, fraction = map(int, parts)
    if minutes >= 60 or seconds >= 60:
        raise ValueError('Invalid subtitle timestamp')
    return ((hours * 60 + minutes) * 60 + seconds) * 1000 + fraction


def intervals(path, duration):
    result = []
    for line in Path(path).read_text(encoding='utf-8-sig').splitlines():
        if '-->' not in line:
            continue
        match = TIME.match(line)
        if match is None:
            raise ValueError(f'Invalid cue time in {path}')
        start, end = millis(match.groups()[:4]), millis(match.groups()[4:])
        if not 0 <= start < end <= duration:
            raise ValueError(f'Out-of-duration cue in {path}')
        result.append(f'{start}-{end}')
    return ','.join(result)


if __name__ == '__main__':
    args = sys.argv[1:]
    if not args or len(args) % 4:
        raise SystemExit('Usage: extract_intervals.py <slug> <duration-seconds> <en.srt> <fr.srt> [...]')
    for index in range(0, len(args), 4):
        slug, seconds, english, french = args[index:index + 4]
        duration = round(float(seconds) * 1000)
        if duration <= 0:
            raise ValueError('Movie duration must be positive')
        print(slug, duration)
        print('en', intervals(english, duration))
        print('fr', intervals(french, duration))
