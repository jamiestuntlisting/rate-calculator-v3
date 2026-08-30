#!/usr/bin/env python3
"""Bundle a ShowBiz SAG Cards export into src/lib/showbiz-sample.ts.

The weekly bench runs this export by default, so it has something to check
the engine against the moment it opens. The raw file is a 1.9 MB UTF-16 CSV;
this stores it gzipped and base64'd, which is about 49 KB and decodes back
byte for byte.

    python3 scripts/build-showbiz-sample.py path/to/export.csv

Only needed to change the bundled default. An admin replacing it day to day
should use "Make this the default" on the bench, which stores the new export
in D1 and takes precedence over the bundled one.
"""

import base64
import gzip
import hashlib
import io
import sys
import textwrap

TARGET = "src/lib/showbiz-sample.ts"

HEADER = '''/**
 * The reference ShowBiz SAG Cards export the weekly bench runs by default.
 *
 * %(filename)s — %(cards)d cards, %(weekly)d of them weekly, and
 * the file docs/weekly-rules.md was derived from. Bundling it means a
 * regression in the weekly engine shows up on the bench without anyone
 * having to go and find an export first: it should read 132 of 133 matching
 * payroll, the one miss being the malformed card S1234.
 *
 * The figures are real payroll to the cent — that is the whole point —
 * but the people and productions are not identifiable: performer names,
 * studios and role lines are blanked and every real production title
 * reads "Real Life Example NN" (the crafted rows were built as "Weekly
 * Timecard Sample NN" from the start). It is gzipped and base64'd; the
 * bundle decodes back to the anonymized CSV byte for byte.
 *
 * Generated, not hand-edited — see scripts/build-showbiz-sample.py. An
 * admin can override it from the bench, which stores the replacement in D1
 * and takes precedence over this; see writeShowbizSample.
 */

import { getDb } from "@/lib/db";
import { SHOWBIZ_SAMPLE } from "./showbiz-sample-meta";

export { SHOWBIZ_SAMPLE };

/** The bundled export, gzipped then base64'd. */
const GZIP_BASE64 =
'''


def decode(raw: bytes) -> str:
    """ShowBiz writes UTF-16 with a BOM, but accept UTF-8 too."""
    if raw[:2] == b"\xff\xfe":
        return raw.decode("utf-16le")
    if raw[:2] == b"\xfe\xff":
        return raw.decode("utf-16be")
    return raw.decode("utf-8")


def main(source: str) -> None:
    csv = decode(open(source, "rb").read())
    utf8 = csv.encode("utf-8")
    encoded = base64.b64encode(gzip.compress(utf8, 9)).decode("ascii")

    # Refuse to write anything that does not decode back to the original.
    if gzip.decompress(base64.b64decode(encoded)).decode("utf-8") != csv:
        raise SystemExit("encoded form does not round-trip; refusing to write")

    lines = [line for line in csv.replace("\r\n", "\n").replace("\r", "\n").split("\n") if line.strip()]
    weekly = sum(1 for line in lines if ",weekly" in line.lower())

    chunks = textwrap.wrap(encoded, 76)
    payload = "\n".join('  "%s" +' % c for c in chunks[:-1])
    payload += '\n  "%s";\n' % chunks[-1]

    header = HEADER % {
        "filename": source.split("/")[-1],
        "cards": len(lines),
        "weekly": weekly,
    }

    existing = io.open(TARGET, encoding="utf-8").read()
    marker = "\n/** Where an admin-supplied replacement lives"
    if marker not in existing:
        raise SystemExit("%s is missing its runtime section" % TARGET)
    runtime = existing[existing.index(marker):]

    io.open(TARGET, "w", encoding="utf-8").write(header + payload + runtime)
    print("round-trip verified; sha256:", hashlib.sha256(utf8).hexdigest()[:16])
    print("wrote %s — %d cards, %d payload lines" % (TARGET, len(lines), len(chunks)))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
