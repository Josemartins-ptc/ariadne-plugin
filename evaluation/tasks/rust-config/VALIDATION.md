# rust-config validation (cargo/rustc 1.97.0, offline)

Each run copies the listed folders (in order, later overlays earlier) into a fresh work dir under
`.target/<run>/` and runs `cargo test --quiet --offline --no-fail-fast` with its OWN
`CARGO_TARGET_DIR=.target/build-<run>` (see the note at the end).

```sh
run() { n=$1; W=$T/.target/$n; mkdir -p $W; shift; for d in "$@"; do cp -R $T/$d/. $W/; done;
        (cd $W && CARGO_TARGET_DIR=$T/.target/build-$n cargo test --quiet --offline --no-fail-fast); }
run ref   starter reference hidden
run stub  starter hidden
run fu    starter reference hidden followup_reference followup_hidden
run stubvis starter
```

| Run | Overlay | visible.rs | hidden.rs | followup_hidden.rs |
|---|---|---|---|---|
| ref | starter + reference + hidden | 3/3 pass | 30/30 pass | - |
| stub | starter + hidden | 0/3 (3 failed) | 0/30 (30 failed) | - |
| fu | starter + reference + hidden + followup_reference + followup_hidden | 3/3 pass | 30/30 pass | 14/14 pass |
| stubvis | starter only | 0/3 (3 failed) | - | - |

The stub compiles without warnings; every stub function is `unimplemented!("not implemented")`, so every test panics.
The reference and follow-up reference build without warnings.

`followup_hidden.rs` does not compile against the first-task reference (it needs `parse_with_defaults` and
`Value::Duration`), as intended: it is only copied in for the follow-up evaluation. Because a test target that
fails to compile aborts the whole `cargo test` run, a follow-up solution that misnames either item scores 0.

No first-task hidden test is changed by the follow-up (no `followup_replaces`): no hidden.rs case uses a
duration-shaped value (`30s`, `5m`, ...) as a bad value.

Note for the harness: the crate's `Cargo.toml` has an empty `[workspace]` table so it builds standalone even when
placed under another Cargo workspace (it lives inside the Ariadne repo here). Do not share one CARGO_TARGET_DIR
across differently overlaid copies of the crate: cargo's mtime fingerprints can reuse a stale `rustconfig` build
(observed once during validation, fixed by isolating target dirs).
