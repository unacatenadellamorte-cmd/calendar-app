"""専用fixtureと非公開関数だけで、削除と連携更新の競合を2接続で検証する。

リモート実行は別途メイン担当が行う。ローカルの構文検査だけではDB検証にならない。
実行例: python supabase/tests/delete_account_concurrency.py
既定のSQL実行器: npx supabase db query --linked --file <一時ファイル> --output json
--query-command にJSON配列を指定すれば既存の管理CLIを利用できる。
各実行器はSQL全体を一つのDBセッションで実行し、SQLエラーを非ゼロ終了で返すこと。
秘密鍵・DB接続情報はこのファイルへ書かず、既存CLIの認証設定を利用する。

公開RPCを適用しない。migrationから抽出した同一本文の関数を専用schemaへ設置し、
PUBLIC/anon/authenticated/service_roleの権限を剥奪する。JWT claimsだけ本人fixtureへ設定する。
2接続の一方がロックを保持し、他方がpg_blocking_pidsで実際に待つことを確認してから解放する。
finallyの後片付けは、ランダム所有nonceが一致する当該実行のfixture/schemaだけに限定する。
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import argparse
import json
import os
import re
import subprocess
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = "account_deletion_concurrency_test"
USER_A = "d3260926-0000-4000-8000-000000000011"
USER_B = "d3260926-0000-4000-8000-000000000012"


def private_functions():
    migration = (ROOT / "supabase/migrations/20260926000000_delete_my_account.sql").read_text(encoding="utf-8")
    statements = []
    for name in ("delete_my_account", "upsert_google_connection"):
        found = re.search(r"create or replace function public\." + name + r"\([\s\S]*?\$\$;", migration, re.IGNORECASE)
        if not found:
            raise RuntimeError("migrationから関数本文を抽出できない: " + name)
        # 宣言のschemaだけを置換し、ロックを含む関数本文は一切変更しない。
        statements.append(found.group().replace("public." + name + "(", SCHEMA + "." + name + "(", 1))
    return "\n".join(statements)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--query-command", default=json.dumps([
        "npx.cmd" if os.name == "nt" else "npx", "supabase", "db", "query",
        "--linked", "--file", "{file}", "--output", "json"
    ]), help="SQLファイルを実行するコマンドのJSON配列。{file}が一時ファイルへ置換される")
    args = parser.parse_args()
    command = json.loads(args.query_command)
    if not isinstance(command, list) or not all(isinstance(part, str) for part in command) or "{file}" not in command:
        raise ValueError("query-commandは{file}を含む文字列配列にする")
    nonce = uuid.uuid4().hex
    old_token = "削除競合テスト-" + nonce + "-旧"
    new_token = "削除競合テスト-" + nonce + "-新"
    protected_token = "削除競合テスト-" + nonce + "-保護"
    tokens = ",".join("'" + value + "'" for value in (old_token, new_token, protected_token))
    claims = json.dumps({"role": "authenticated", "sub": USER_A})
    email_a = nonce + "-a@example.invalid"
    email_b = nonce + "-b@example.invalid"
    functions = private_functions()
    setup_confirmed = False
    setup_attempted = False

    with tempfile.TemporaryDirectory(prefix="calendar-deletion-sql-") as directory:
        def query(sql):
            path = Path(directory) / (uuid.uuid4().hex + ".sql")
            path.write_text(sql, encoding="utf-8")
            result = subprocess.run([str(path) if part == "{file}" else part for part in command],
                                    cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=75)
            if result.returncode:
                # SQLには専用fixture以外の値を含めず、認証トークンはコマンドに渡さない。
                raise RuntimeError("SQL実行失敗: " + (result.stderr or result.stdout)[-3000:])
            return result.stdout

        setup = f"""
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
  if exists(select 1 from pg_namespace where nspname='{SCHEMA}') then
    raise exception '専用schemaが既存のため中止';
  end if;
  if exists(select 1 from auth.users where id in ('{USER_A}','{USER_B}')) then
    raise exception 'fixture UUIDが既存IDと衝突するため中止';
  end if;
end $$;
create schema {SCHEMA};
revoke all on schema {SCHEMA} from public, anon, authenticated, service_role;
create table {SCHEMA}.ownership(nonce text primary key);
insert into {SCHEMA}.ownership values('{nonce}');
{functions}
revoke all on all functions in schema {SCHEMA} from public, anon, authenticated, service_role;
insert into auth.users(id,aud,role,email) values
  ('{USER_A}','authenticated','authenticated','{email_a}'),
  ('{USER_B}','authenticated','authenticated','{email_b}');
select {SCHEMA}.upsert_google_connection('{USER_A}','{old_token}','{email_a}');
select {SCHEMA}.upsert_google_connection('{USER_B}','{protected_token}','{email_b}');
commit;
"""
        cleanup = f"""
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ declare owned boolean := false;
begin
  if to_regclass('{SCHEMA}.ownership') is not null then
    execute 'select exists(select 1 from {SCHEMA}.ownership where nonce=$1)' into owned using '{nonce}';
  end if;
  if owned then
    -- setup応答が失われても、DB側の所有印が一致する場合だけ片付ける。
    if exists(select 1 from auth.users where
      (id='{USER_A}' and email is distinct from '{email_a}') or
      (id='{USER_B}' and email is distinct from '{email_b}')) then
      raise exception 'fixture所有確認失敗。自動消去を中止';
    end if;
    delete from auth.users where id in ('{USER_A}','{USER_B}');
    -- 既知の無効なfixtureトークンだけを照合し、競合で孤立した秘密情報も除去する。
    delete from vault.secrets where id in (
      select id from vault.decrypted_secrets where decrypted_secret in ({tokens})
    );
    execute 'drop schema {SCHEMA} cascade';
  end if;
end $$;
commit;
"""
        def overlap(update_first):
            suffix = "update" if update_first else "delete"
            holder = "deletion-holder-" + nonce[:12] + "-" + suffix
            waiter = "deletion-waiter-" + nonce[:12] + "-" + suffix
            first_operation = (f"select {SCHEMA}.upsert_google_connection('{USER_A}','{new_token}','{email_a}');"
                               if update_first else f"select {SCHEMA}.delete_my_account();")
            if update_first:
                second_operation = f"select {SCHEMA}.delete_my_account();"
            else:
                second_operation = f"""do $$ begin
  begin
    perform {SCHEMA}.upsert_google_connection('{USER_A}','{new_token}','{email_a}');
    raise exception '削除済みユーザーの連携更新が成功した';
  exception when foreign_key_violation then null;
  end;
end $$;"""
            first = f"""
begin;
set local lock_timeout='20s';
set local statement_timeout='30s';
select set_config('request.jwt.claims','{claims}',true);
{first_operation}
select set_config('application_name','{holder}',true);
-- 相手の実際のロック待ちを確認するまではCOMMITしない。
do $$ declare deadline timestamptz := clock_timestamp()+interval '15 seconds';
begin
  loop
    perform pg_stat_clear_snapshot();
    exit when exists(select 1 from pg_stat_activity where application_name='{waiter}'
      and pg_backend_pid()=any(pg_blocking_pids(pid)));
    if clock_timestamp()>deadline then raise exception '相手のロック待ちを確認できなかった'; end if;
    perform pg_sleep(0.05);
  end loop;
end $$;
commit;
"""
            second = f"""
begin;
set local lock_timeout='20s';
set local statement_timeout='30s';
select set_config('request.jwt.claims','{claims}',true);
select set_config('application_name','{waiter}',true);
-- holderの関数実行が済み、行ロックを保持していることを待つ。
do $$ declare deadline timestamptz := clock_timestamp()+interval '15 seconds';
begin
  loop
    perform pg_stat_clear_snapshot();
    exit when exists(select 1 from pg_stat_activity where application_name='{holder}');
    if clock_timestamp()>deadline then raise exception '先行処理のロック取得を確認できなかった'; end if;
    perform pg_sleep(0.05);
  end loop;
end $$;
{second_operation}
commit;
"""
            # 2回の管理API呼出しが、それぞれ独立したトランザクション接続となる。
            with ThreadPoolExecutor(max_workers=2) as pool:
                futures = [pool.submit(query, first), pool.submit(query, second)]
                errors = []
                for future in futures:
                    try:
                        future.result()
                    except Exception as error:
                        errors.append(error)
                if errors:
                    raise RuntimeError("2接続競合検証失敗: " + "; ".join(map(str, errors)))

        assert_deleted = f"""
do $$ begin
  if exists(select 1 from auth.users where id='{USER_A}')
    or exists(select 1 from public.connections where user_id='{USER_A}') then
    raise exception '本人が残っている';
  end if;
  if exists(select 1 from vault.decrypted_secrets where decrypted_secret in ('{old_token}','{new_token}')) then
    raise exception '本人の新旧Vault秘密情報が残っている';
  end if;
  if not exists(select 1 from auth.users where id='{USER_B}' and email='{email_b}')
    or not exists(select 1 from public.connections where user_id='{USER_B}')
    or not exists(select 1 from vault.decrypted_secrets where decrypted_secret='{protected_token}') then
    raise exception '別ユーザー保護に失敗';
  end if;
end $$;
"""
        try:
            setup_attempted = True
            query(setup)
            setup_confirmed = True
            overlap(update_first=True)
            query(assert_deleted)
            # 同じ専用本人fixtureだけを再作成して、逆順の競合を検証する。
            query(f"""begin;
insert into auth.users(id,aud,role,email) values('{USER_A}','authenticated','authenticated','{email_a}');
select {SCHEMA}.upsert_google_connection('{USER_A}','{old_token}','{email_a}');
commit;""")
            overlap(update_first=False)
            query(assert_deleted)
            print("更新先行・削除先行の両方でロック待ちと新旧Vault消去、別ユーザー保護を確認した。")
        finally:
            if setup_attempted:
                # 成功フラグだけに頼らず、応答喪失時もDBの所有nonceで安全に判定する。
                query(cleanup)
                if setup_confirmed:
                    query(f"""do $$ begin
  if exists(select 1 from pg_namespace where nspname='{SCHEMA}')
    or exists(select 1 from auth.users where id in ('{USER_A}','{USER_B}'))
    or exists(select 1 from vault.decrypted_secrets where decrypted_secret in ({tokens})) then
    raise exception '後片付けが完了していない';
  end if;
end $$;""")
                    print("専用schema・仮関数・fixture2名・秘密情報の消去を確認した。")


if __name__ == "__main__":
    main()
