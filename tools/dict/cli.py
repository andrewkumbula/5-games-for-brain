from __future__ import annotations

import argparse
import sys
from pathlib import Path
from urllib.request import urlopen

from tools.dict.core import build_dictionary, validate_dictionary
from tools.dict.quality import audit_dictionary
from tools.dict.lex_review import (
    apply_blocklist_file,
    collect_lex_scores,
    export_alphabetical,
    load_blocklist,
    write_lex_scores_tsv,
)
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


def command_export_alpha(args: argparse.Namespace) -> int:
    data = read_json(Path(args.words_path))
    export_alphabetical(data.allowed, Path(args.out))
    print(f"Слов: {len(data.allowed)} → {args.out}")
    return 0


def command_lex_scores(args: argparse.Namespace) -> int:
    data = read_json(Path(args.words_path))
    rows = collect_lex_scores(data.allowed)
    write_lex_scores_tsv(rows, Path(args.out))
    print(f"Строк TSV: {len(rows)} → {args.out}")
    return 0


def command_pipeline(args: argparse.Namespace) -> int:
    """blocklist → pymorphy quality → опционально ИИ в файл для ручного переноса в blocklist."""
    wp = Path(args.words_path)
    bp = Path(args.blocklist_path)
    do_write = args.apply

    print("=== pipeline: словарь «5 букв» ===\n")

    if args.skip_strip:
        print("[1/3] strip-blocklist: пропуск (--skip-strip)")
    else:
        blk = load_blocklist(bp)
        if not blk:
            print(f"[1/3] strip-blocklist: пропуск (нет слов в {bp})")
        else:
            removed_a, removed_q, nbl = apply_blocklist_file(wp, bp, dry_run=not do_write)
            mode = "записано" if do_write else "dry-run"
            print(
                f"[1/3] strip-blocklist ({mode}): blocklist={nbl} слов, "
                f"-allowed {removed_a}, -answers {removed_q}",
            )

    if args.skip_quality:
        print("[2/3] quality (pymorphy): пропуск (--skip-quality)")
    else:
        data = read_json(wp)
        manual_keep: set[str] | None = None
        kp = Path(args.keep_path)
        if kp.exists():
            manual_keep = {
                line.strip().lower()
                for line in kp.read_text(encoding="utf-8").splitlines()
                if line.strip() and not line.strip().startswith("#")
            }

        cleaned_allowed, issues, reason_counts = audit_dictionary(
            data,
            min_score=args.min_score,
            exclude_proper=not args.allow_proper,
            require_singular=args.require_singular,
            manual_keep=manual_keep,
        )
        allowed_set = set(cleaned_allowed)
        cleaned_answers = [w for w in data.answers if w in allowed_set]

        print(f"[2/3] quality: allowed {len(data.allowed)} → {len(cleaned_allowed)}; ", end="")
        print(f"answers {len(data.answers)} → {len(cleaned_answers)}; flagged {len(issues)}")
        if reason_counts:
            for reason, count in reason_counts.most_common(6):
                print(f"      - {reason}: {count}")

        if args.flagged_path:
            fp = Path(args.flagged_path)
            fp.parent.mkdir(parents=True, exist_ok=True)
            fp.write_text(
                "\n".join(f"{it.word}\t{','.join(it.reasons)}" for it in issues) + "\n",
                encoding="utf-8",
            )
            print(f"      flagged → {fp}")

        if do_write:
            cleaned_data = type(data)(allowed=cleaned_allowed, answers=cleaned_answers)
            out_json = Path(args.output_words or args.words_path)
            write_json(out_json, cleaned_data)
            print(f"      сохранено: {out_json}")
        else:
            print("      (dry-run: JSON не перезаписан)")

    if not args.ai_review:
        print("\n[3/3] AI-обзор: пропуск (добавьте --ai-review и OPENAI_API_KEY)")
        return 0

    from tools.dict.ai_batch_review import run_ai_review

    data = read_json(wp)
    pool = list(data.answers if args.ai_pool == "answers" else data.allowed)
    if args.ai_max_words:
        pool = pool[: int(args.ai_max_words)]
    try:
        n_bad, n_batches = run_ai_review(
            pool,
            out_path=Path(args.ai_out),
            batch_size=args.ai_batch_size,
            model=args.ai_model,
            sleep_s=args.ai_sleep,
            max_batches=args.ai_max_batches,
        )
    except Exception as e:
        print(f"\n[3/3] AI-обзор: ошибка: {e}")
        return 1
    print(
        f"\n[3/3] AI-обзор: добавлено подозрительных: {n_bad} "
        f"(батчей {n_batches}) → {args.ai_out}",
    )
    print("    Просмотрите файл и перенесите строки в docs/blocked_words.txt, затем снова pipeline.")
    return 0


def command_strip_blocklist(args: argparse.Namespace) -> int:
    removed_a, removed_q, nbl = apply_blocklist_file(
        Path(args.words_path),
        Path(args.blocklist_path),
        dry_run=args.dry_run,
    )
    mode = "сухой прогон" if args.dry_run else "записано в words.json"
    print(
        f"{mode}: строк в blocklist (не пустых): {nbl}; "
        f"убрано из allowed: {removed_a}, из answers: {removed_q}"
    )
    if removed_a == 0 and not args.dry_run:
        data = read_json(Path(args.words_path))
        from tools.dict.lex_review import load_blocklist

        ghost = load_blocklist(Path(args.blocklist_path)) - set(data.allowed)
        if ghost:
            print(
                "В blocklist есть слова, которых уже нет в словаре (можно удалить строки):",
                ", ".join(sorted(ghost)[:15]),
                "…" if len(ghost) > 15 else "",
            )
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

    export_alpha = sub.add_parser(
        "export-alpha",
        help="Все слова по алфавиту с секциями по первой букве (для ручной вычитки).",
    )
    export_alpha.add_argument("--words-path", default="words.json")
    export_alpha.add_argument("--out", default="docs/all_words_alpha.txt")
    export_alpha.set_defaults(func=command_export_alpha)

    lex_scores = sub.add_parser(
        "lex-scores",
        help="TSV: слова по возрастанию pymorphy score для NOUN+nomn (сначала сомнительные).",
    )
    lex_scores.add_argument("--words-path", default="words.json")
    lex_scores.add_argument("--out", default="docs/lex_scores.tsv")
    lex_scores.set_defaults(func=command_lex_scores)

    strip_bl = sub.add_parser(
        "strip-blocklist",
        help="Удалить слова из docs/blocked_words.txt (и подобных) из words.json.",
    )
    strip_bl.add_argument("--words-path", default="words.json")
    strip_bl.add_argument("--blocklist-path", default="docs/blocked_words.txt")
    strip_bl.add_argument("--dry-run", action="store_true")
    strip_bl.set_defaults(func=command_strip_blocklist)

    pipe = sub.add_parser(
        "pipeline",
        help="Флоу: strip-blocklist → quality (pymorphy) → опционально ИИ в файл (не в рантайме бота).",
    )
    pipe.add_argument("--words-path", default="words.json")
    pipe.add_argument("--blocklist-path", default="docs/blocked_words.txt")
    pipe.add_argument(
        "--apply",
        action="store_true",
        help="Записать words.json после strip и quality (без флага — только отчёт).",
    )
    pipe.add_argument("--skip-strip", action="store_true")
    pipe.add_argument("--skip-quality", action="store_true")
    pipe.add_argument("--min-score", type=float, default=0.2)
    pipe.add_argument("--allow-proper", action="store_true")
    pipe.add_argument("--require-singular", action="store_true")
    pipe.add_argument("--keep-path", default="docs/manual_keep_words.txt")
    pipe.add_argument("--output-words", help="Куда писать JSON после quality (по умолчанию --words-path)")
    pipe.add_argument("--flagged-path", help="TSV: слово\tпричины после quality")
    pipe.add_argument(
        "--ai-review",
        action="store_true",
        help="После шагов 1–2 вызвать OpenAI и дописать подозрительные в --ai-out",
    )
    pipe.add_argument("--ai-out", default="docs/ai_suggested_blocklist.txt")
    pipe.add_argument("--ai-pool", choices=["answers", "allowed"], default="answers")
    pipe.add_argument("--ai-batch-size", type=int, default=28)
    pipe.add_argument("--ai-model", default="gpt-4o-mini")
    pipe.add_argument("--ai-sleep", type=float, default=0.4)
    pipe.add_argument("--ai-max-words", type=int, help="Ограничить число слов для ИИ (тест)")
    pipe.add_argument("--ai-max-batches", type=int, help="Ограничить число батчей (тест)")
    pipe.set_defaults(func=command_pipeline)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
