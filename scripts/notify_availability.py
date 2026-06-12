#!/usr/bin/env python3
"""21:00〜23:00 の空きが新しく出たら LINE で通知する。

data/availability.json を読み、今日以降の日付で「21:00～23:00」が ok（空き）の
体育館を集める。前回の状態（data/notify_state_2123.json）と比べて “新たに空いた”
ものだけを LINE 公式アカウントから broadcast（友だち全員へ）で通知する。

- 同じ空きを何度も通知しない（状態ファイルで管理）
- 一度埋まってまた空いた場合は再通知する
- 初回（状態ファイルなし）は通知せず現状だけ記録（既存の空きの一括通知を防ぐ）
- LINE_CHANNEL_ACCESS_TOKEN（環境変数）が無ければ通知はスキップ（状態は更新）

必要な環境変数:
  LINE_CHANNEL_ACCESS_TOKEN … LINE Messaging API のチャネルアクセストークン
"""
import datetime
import json
import os
import sys

import requests

SLOT = "21:00～23:00"
AVAIL = "data/availability.json"
STATE = "data/notify_state_2123.json"
WD = "月火水木金土日"  # Monday=0


def load_state():
    if not os.path.exists(STATE):
        return None  # 初回
    try:
        with open(STATE, encoding="utf-8") as f:
            return set(json.load(f).get("open", []))
    except Exception:
        return set()


def save_state(open_set):
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump({"open": sorted(open_set)}, f, ensure_ascii=False, indent=2)
        f.write("\n")


def get_token():
    """Secretからトークンを取得。空白や誤って付けた 'Bearer ' を除去。"""
    token = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN", "").strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    return token


def send_line(token, text):
    res = requests.post(
        "https://api.line.me/v2/bot/message/broadcast",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        data=json.dumps({"messages": [{"type": "text", "text": text}]}),
        timeout=20,
    )
    return res


def run_test_notify():
    """workflow_dispatch の test_notify=true 用。LINE接続の疎通確認。"""
    token = get_token()
    if not token:
        print("LINE_CHANNEL_ACCESS_TOKEN 未設定。Secretを確認してください。", file=sys.stderr)
        sys.exit(1)
    # トークン本体は出さず、長さだけ表示（チャネルシークレット混同などの切り分け用）
    print(f"トークン長: {len(token)} 文字（参考: チャネルシークレットなら32文字、"
          f"アクセストークン(長期)は150文字以上が多い）")
    now = datetime.datetime.now().strftime("%m/%d %H:%M")
    text = f"✅ LINE接続テスト（{now}）\nこのメッセージが届けば通知設定はOK！\n21:00〜23:00に空きが出たらお知らせするよ🏸"
    res = send_line(token, text)
    if res.status_code != 200:
        print(f"LINE接続テスト失敗: {res.status_code} {res.text}", file=sys.stderr)
        sys.exit(1)
    print("LINE接続テスト成功: 友だち全員にテストメッセージを送信しました")


def main():
    if os.environ.get("TEST_NOTIFY", "").lower() == "true":
        run_test_notify()
        return

    with open(AVAIL, encoding="utf-8") as f:
        data = json.load(f)
    source = data.get("source", "")
    today = datetime.date.today()

    # いま 21-23 が空いている (日付|館名) の集合と、各々の状態(ok/ok2)
    cur = set()
    status_of = {}
    for gym in data.get("gyms", []):
        name = gym.get("name", "")
        for date_str, slots in (gym.get("dates") or {}).items():
            try:
                d = datetime.date.fromisoformat(date_str)
            except ValueError:
                continue
            st = slots.get(SLOT)
            if d >= today and st in ("ok", "ok2", "ok3"):
                key = f"{date_str}|{name}"
                cur.add(key)
                status_of[key] = st

    prev = load_state()

    # 初回は通知せず現状だけ記録
    if prev is None:
        save_state(cur)
        print("初回: 現在の空き状況を記録（通知なし）")
        return

    new = cur - prev
    save_state(cur)  # 埋まったものは落ちる→再び空けば次回 new になる

    if not new:
        print("新たな空きなし")
        return

    token = get_token()

    # 「日付 → 体育館 → 時間」の順で1件ずつ、ポップに整形
    slot_disp = SLOT.replace("～", "〜")
    face = {"ok2": "2面", "ok3": "3面以上"}  # 複数面のときに付けるラベル
    items = []
    for item in new:
        ds, nm = item.split("|", 1)
        d = datetime.date.fromisoformat(ds)
        items.append((d, nm.replace("体育館", ""), face.get(status_of.get(item), "")))
    items.sort(key=lambda x: (x[0], x[1]))

    lines = ["📢 体育館に空きが出たよ〜！🏸", ""]
    for d, nm, tag in items:
        suffix = f"　✨{tag}" if tag else ""
        lines.append(f"🗓 {d.month}/{d.day}({WD[d.weekday()]})　🏟 {nm}　⏰ {slot_disp}{suffix}")
    lines.append("")
    lines.append("お早めにどうぞ〜！🙌")
    if source:
        lines.append(f"👉 予約はこちら\n{source}")
    text = "\n".join(lines)

    if not token:
        print("LINE_CHANNEL_ACCESS_TOKEN 未設定。通知スキップ:\n" + text)
        return

    res = send_line(token, text)
    if res.status_code != 200:
        # 通知失敗でワークフロー全体は落とさない（次回再試行）
        print(f"LINE通知失敗: {res.status_code} {res.text}", file=sys.stderr)
        return
    print("LINE通知送信:\n" + text)


if __name__ == "__main__":
    main()
