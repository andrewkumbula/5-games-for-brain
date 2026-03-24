from __future__ import annotations

import argparse
import sys
from pathlib import Path
from urllib.request import urlopen

from tools.dict.core import build_dictionary, validate_dictionary
from tools.dict.quality import audit_dictionary
from tools.dict.storage import read_db, read_json, write_db, write_json


DEFAULT_SOURCE_URL = "https://raw.githubusercontent.com/mediahope/Wordle-Russian-Dictionary/main/Russian.txt"


def fetch_lines(source: str) -> list[str]:
    if source.startswith("http://") or source.startswith("https://"):
        with urlopen(source) as resp:
            data = resp.read().decode("utf-8", errors="ignore")
        return data.splitlines()
    return Path(source).read_text(encoding="utf-8").splitlines()


def command_build(args: argparse.Namespace) -> int:
    sources = [args.source_url]
    if args.extra_source_url:
        sources.append(args.extra_source_url)

    lines_sources = [fetch_lines(src) for src in sources]
    data = build_dictionary(
        lines_sources,
        args.yo,
        args.answers_size,
        args.seed,
        nouns_only=getattr(args, "nouns_only", False),
        required_case=getattr(args, "gram_case", None),
    )
    errors = validate_dictionary(data, args.min_allowed)
    if errors:
        print("Validation failed:", ", ".join(errors))
        return 2

    print(f"Sources: {', '.join(sources)}")
    total_lines = sum(len(lines) for lines in lines_sources)
    print(f"Total lines: {total_lines}")
    print(f"Allowed: {len(data.allowed)}")
    print(f"Answers: {len(data.answers)}")

    if args.dry_run:
        print("Dry run: no output written.")
        return 0

    if args.out in ("json", "both"):
        write_json(Path(args.words_path), data)
        print(f"Saved JSON: {args.words_path}")
    if args.out in ("db", "both"):
        write_db(Path(args.db_path), data, args.db_mode, sources)
        print(f"Saved DB: {args.db_path}")
    return 0


def command_validate(args: argparse.Namespace) -> int:
    if args.source == "json":
        data = read_json(Path(args.words_path))
    else:
        data = read_db(Path(args.db_path))
    errors = validate_dictionary(data, args.min_allowed)
    if errors:
        print("Validation failed:", ", ".join(errors))
        return 2
    print("Validation OK")
    print(f"Allowed: {len(data.allowed)}")
    print(f"Answers: {len(data.answers)}")
    return 0


def command_stats(args: argparse.Namespace) -> int:
    if args.source == "json":
        data = read_json(Path(args.words_path))
    else:
        data = read_db(Path(args.db_path))
    print(f"Allowed: {len(data.allowed)}")
    print(f"Answers: {len(data.answers)}")
    if data.allowed:
        print(f"First 5: {data.allowed[:5]}")
        print(f"Last 5: {data.allowed[-5:]}")
        has_yo = any("ё" in w for w in data.allowed)
        print(f"Contains ё: {has_yo}")
    return 0


def command_quality(args: argparse.Namespace) -> int:
    if args.source == "json":
        data = read_json(Path(args.words_path))
    else:
        data = read_db(Path(args.db_path))

    manual_keep: set[str] | None = None
    if args.keep_path:
        keep_path = Path(args.keep_path)
        if keep_path.exists():
            manual_keep = {
                line.strip().lower()
                for line in keep_path.read_text(encoding="utf-8").splitlines()
                if line.strip() and not line.strip().startswith("#")
            }
        else:
            manual_keep = set()

    cleaned_allowed, issues, reason_counts = audit_dictionary(
        data,
        min_score=args.min_score,
        exclude_proper=not args.allow_proper,
        require_singular=args.require_singular,
        manual_keep=manual_keep,
    )
    allowed_set = set(cleaned_allowed)
    cleaned_answers = [w for w in data.answers if w in allowed_set]

    print(f"Allowed (before): {len(data.allowed)}")
    print(f"Answers (before): {len(data.answers)}")
    print(f"Flagged: {len(issues)}")
    print(f"Allowed (after): {len(cleaned_allowed)}")
    print(f"Answers (after): {len(cleaned_answers)}")

    if reason_counts:
        print("Reasons:")
        for reason, count in reason_counts.most_common():
            print(f"- {reason}: {count}")

    if issues and args.max_print > 0:
        print("Examples:")
        for item in issues[: args.max_print]:
            print(f"- {item.word}: {', '.join(item.reasons)}")

    if args.flagged_path:
        flagged_path = Path(args.flagged_path)
        flagged_path.parent.mkdir(parents=True, exist_ok=True)
        lines = [f"{item.word}\t{','.join(item.reasons)}" for item in issues]
        flagged_path.write_text("\n".join(lines), encoding="utf-8")
        print(f"Saved flagged list: {flagged_path}")

    if not args.apply:
        print("Dry run mode: dictionary not changed.")
        return 0

    cleaned_data = type(data)(allowed=cleaned_allowed, answers=cleaned_answers)
    if args.source == "json":
        out_json = Path(args.output_words or args.words_path)
        write_json(out_json, cleaned_data)
        print(f"Saved JSON: {out_json}")
    else:
        write_db(Path(args.db_path), cleaned_data, mode="replace", sources=["quality_audit"])
        print(f"Saved DB: {args.db_path}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="dict")
    sub = parser.add_subparsers(dest="command", required=True)

    build = sub.add_parser("build")
    build.add_argument("--out", choices=["json", "db", "both"], default="json")
    build.add_argument("--words-path", default="words.json")
    build.add_argument("--db-path", default="data.db")
    build.add_argument("--source-url", default=DEFAULT_SOURCE_URL)
    build.add_argument("--extra-source-url")
    build.add_argument("--yo", choices=["to_e", "keep"], default="to_e")
    build.add_argument("--answers-size", type=int)
    build.add_argument("--seed", type=int)
    build.add_argument("--nouns-only", action="store_true")
    build.add_argument("--gram-case", choices=["nomn"], default=None)
    build.add_argument("--min-allowed", type=int, default=5000)
    build.add_argument("--dry-run", action="store_true")
    build.add_argument("--db-mode", choices=["replace", "upsert"], default="replace")
    build.set_defaults(func=command_build)

    validate = sub.add_parser("validate")
    validate.add_argument("--source", choices=["json", "db"], default="json")
    validate.add_argument("--words-path", default="words.json")
    validate.add_argument("--db-path", default="data.db")
    validate.add_argument("--min-allowed", type=int, default=5000)
    validate.set_defaults(func=command_validate)

    stats = sub.add_parser("stats")
    stats.add_argument("--source", choices=["json", "db"], default="json")
    stats.add_argument("--words-path", default="words.json")
    stats.add_argument("--db-path", default="data.db")
    stats.set_defaults(func=command_stats)

    quality = sub.add_parser("quality")
    quality.add_argument("--source", choices=["json", "db"], default="json")
    quality.add_argument("--words-path", default="words.json")
    quality.add_argument("--db-path", default="data.db")
    quality.add_argument("--min-score", type=float, default=0.2)
    quality.add_argument("--allow-proper", action="store_true")
    quality.add_argument("--require-singular", action="store_true")
    quality.add_argument("--max-print", type=int, default=50)
    quality.add_argument("--flagged-path")
    quality.add_argument("--keep-path")
    quality.add_argument(
        "--output-words",
        help="When using --apply with JSON source, write cleaned dictionary here (default: --words-path)",
    )
    quality.add_argument("--apply", action="store_true")
    quality.set_defaults(func=command_quality)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
