#!/usr/bin/env python3
"""
あじさいネット（神戸市 施設予約システム）から、指定体育館の空き状況を
ゲスト（ログイン不要）の「空き状況照会」フローでスクレイピングし、
data/availability.json を生成する。

- 公開情報（空き状況照会）のみを、低頻度・行儀よく取得する想定。
- ページは Shift-JIS(CP932)。日本語の送信値も CP932 でエンコードする。
- 体育館×時間帯×日 のグリッドを日単位に集約して ok/few/full/closed を判定する。

依存: requests（標準ライブラリ + requests のみ）
"""
import sys, re, json, time, datetime, urllib.parse, ssl
import requests
from requests.adapters import HTTPAdapter
from urllib3.util import ssl_


class LegacyTLSAdapter(HTTPAdapter):
    """相手サーバー(shisetsu-yoyaku.jp)が古いTLS実装で、OpenSSL 3.x が既定で無効化する
    レガシー再ネゴシエーションを要求するため、それを許可するSSLコンテキストを使う。
    （UNSAFE_LEGACY_RENEGOTIATION_DISABLED 対策）"""

    def _ctx(self):
        ctx = ssl_.create_urllib3_context()
        # OP_LEGACY_SERVER_CONNECT (= 0x4) を有効化（3.11 では属性が無いため数値で）
        ctx.options |= getattr(ssl, "OP_LEGACY_SERVER_CONNECT", 0x4)
        # 古いサーバー向けにセキュリティレベルを下げる（弱い鍵交換でも接続可に）
        ctx.set_ciphers("DEFAULT@SECLEVEL=1")
        return ctx

    def init_poolmanager(self, *args, **kwargs):
        kwargs["ssl_context"] = self._ctx()
        return super().init_poolmanager(*args, **kwargs)

    def proxy_manager_for(self, *args, **kwargs):
        kwargs["ssl_context"] = self._ctx()
        return super().proxy_manager_for(*args, **kwargs)

BASE = "https://shisetsu-yoyaku.jp/ajisai"
UA = "Mozilla/5.0 (compatible; raise-badminton-availability/1.0; +https://github.com/yuki5ilg/raise)"

# 取得対象の体育館（施設キーは ShisetsuMultiSelect の chng_chkboxImage 第2引数）
META = "運動施設／体育館／王子・中央・磯上・垂水などの大型体育館"  # 大分類
SUB = "バドミントン"  # 小分類（利用目的）
# 表示名 -> 施設キー（複数室ある施設は代表の競技場を採用）
TARGETS = {
    "磯上体育館": "281000_002_08_01_01",
    "須磨体育館": "281000_002_05_01_01",
    "垂水体育館": "281000_002_07_01_01",
    "東灘体育館": "281000_002_04_01_01",
}
# 検索結果(9施設)の行順。選択行のみ checkMeisaiUniqKey に値を入れて送信する。
ROW_ORDER = [
    "281000_002_02_01_01", "281000_002_02_03_01", "281000_002_03_01_01",
    "281000_002_04_01_01", "281000_002_04_03_01", "281000_002_05_01_01",
    "281000_002_06_01_01", "281000_002_07_01_01", "281000_002_08_01_01",
]
NUM_WEEKS = 5  # 取得する週数（7日 × 5 = 35日先まで）

H = {"Content-Type": "application/x-www-form-urlencoded"}


def enc(params):
    """(k,v) のリストを CP932 で percent-encode した body 文字列にする。"""
    return "&".join(
        f"{urllib.parse.quote(str(k), encoding='cp932')}={urllib.parse.quote(str(v), encoding='cp932')}"
        for k, v in params
    )


def post(session, path, params):
    for attempt in range(4):
        r = session.post(f"{BASE}{path}", data=enc(params), headers=H, timeout=30)
        if r.status_code == 200:
            return r.content.decode("cp932", "replace")
        time.sleep(2 * (attempt + 1))
    r.raise_for_status()


def reach_availability(session, start: datetime.date):
    """ゲストフローをたどり、対象施設を選択して空き状況照会ページのHTMLを返す。"""
    session.get(f"{BASE}/Welcome.cgi", timeout=30)
    post(session, "/menu/Login.cgi",
         [("action", "Akisyoukai"), ("txtProcId", "/menu/Login"), ("loginBtn", "0")])
    post(session, "/yoyaku/QueryMethodSelect.cgi",
         [("action", "Enter"), ("txtSelectKey", "1"),
          ("txtProcId", "/yoyaku/QueryMethodSelect"),
          ("txtActivePath", "/yoyaku/QueryMethodSelect"), ("txtFunctionCode", "")])
    common = [("txtProcId", "/yoyaku/ShisetsuSearch"),
              ("txtActivePath", "/yoyaku/ShisetsuSearch"), ("txtFunctionCode", ""),
              ("metaRiyouMokuteki", META),
              ("dispDateYear", f"{start.year}"), ("dispDateMonth", f"{start.month:02d}"),
              ("dispDateDay", f"{start.day:02d}")]
    # 大分類=体育館 に切替（小分類を読み込ませる）
    post(session, "/yoyaku/ShisetsuSearch.cgi",
         [("action", "MetaChange")] + common + [("riyouMokuteki", "軟式野球")])
    # 検索実行（小分類=バドミントン）
    post(session, "/yoyaku/ShisetsuSearch.cgi",
         [("action", "Enter")] + common + [("riyouMokuteki", SUB)])
    # 施設選択（行順に checkMeisaiUniqKey、選択行のみ値あり）→ 空き照会へ
    sel = [("action", "Enter"), ("txtProcId", "/yoyaku/ShisetsuMultiSelect"),
           ("txtActivePath", "/yoyaku/ShisetsuMultiSelect"),
           ("txtFunctionCode", "Yoyaku"), ("shokaiHouhou", "1")]
    chosen = set(TARGETS.values())
    for key in ROW_ORDER:
        sel.append(("checkMeisaiUniqKey", key if key in chosen else ""))
    return post(session, "/yoyaku/ShisetsuMultiSelect.cgi", sel)


def calendar_form_fields(html):
    """空き状況ページ内の CalendarStatusBrowser フォームの全フィールドを取り出す。"""
    m = re.search(r'<form[^>]*action="[^"]*CalendarStatusBrowser\.cgi"[^>]*>(.*?)</form>',
                  html, re.S)
    if not m:
        return None
    body = m.group(1)
    fields = []
    for inp in re.finditer(r'<input[^>]*>', body):
        s = inp.group(0)
        typ = (re.search(r'type="?([a-z]+)"?', s, re.I) or [None, "text"])
        typ = typ.group(1).lower() if hasattr(typ, "group") else "text"
        nm = re.search(r'name="([^"]*)"', s)
        if not nm:
            continue
        vl = re.search(r'value="([^"]*)"', s)
        val = vl.group(1) if vl else ""
        if typ in ("checkbox", "radio") and "checked" not in s.lower():
            continue
        fields.append((nm.group(1), val))
    for sel in re.finditer(r'<select[^>]*name="([^"]*)"[^>]*>(.*?)</select>', body, re.S):
        opt = re.search(r'<option[^>]*value="([^"]*)"[^>]*selected', sel.group(2))
        if opt:
            fields.append((sel.group(1), opt.group(1)))
    return fields


STATUS_IMG = {
    "空いています": "free",
    "予約済みです": "booked",
    "休館日です": "closed",
    "施設を利用できません": "closed",
    "利用できません": "closed",
}


def parse_week(html, week_start: datetime.date):
    """1ページ(7日分)を解析し {施設名: {date: [slot statuses]}} を返す。

    施設名は表の外側の kaikan_title に、グリッドは summary 付きの table にある。
    出現位置で施設名とグリッドを対応付ける。
    """
    result = {}
    titles = [(m.start(), m.group(1).strip())
              for m in re.finditer(r'kaikan_title[^>]*>\s*<span[^>]*>\s*([^<]+?)\s*</span>', html)]

    def gym_for(pos):
        cur = None
        for p, name in titles:
            if p < pos:
                cur = name
            else:
                break
        return cur

    for g in re.finditer(r'<table[^>]*summary="選択した施設[^"]*">(.*?)</table>', html, re.S):
        gym = gym_for(g.start())
        if gym not in TARGETS:
            continue
        day_map = result.setdefault(gym, {})
        for row in re.findall(r'<tr[^>]*>(.*?)</tr>', g.group(1), re.S):
            cells = re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', row, re.S)
            if len(cells) < 8:
                continue
            label = re.sub(r'<[^>]*>', '', cells[0])
            if "～" not in label and ":" not in label:
                continue  # 時間帯行のみ
            slot = re.sub(r'\s|　', '', label)  # 例: "21:00 ～ 23:00" -> "21:00～23:00"
            for col in range(1, 8):
                alts = re.findall(r'alt="([^"]*)"', cells[col])
                status = next((STATUS_IMG[a] for a in alts if a in STATUS_IMG), None)
                if status is None:
                    continue
                d = (week_start + datetime.timedelta(days=col - 1)).isoformat()
                day_map.setdefault(d, {})[slot] = status  # raw: free/booked/closed
    return result


# 取得した生ステータス -> UI用ステータス
RAW2UI = {"free": "ok", "booked": "full", "closed": "closed"}


def main():
    today = datetime.date.today()
    session = requests.Session()
    session.headers["User-Agent"] = UA
    session.mount("https://", LegacyTLSAdapter())

    html = reach_availability(session, today)
    if "施設別空き状況照会" not in html:
        print("ERROR: 空き状況ページに到達できませんでした", file=sys.stderr)
        sys.exit(1)

    # 施設名 -> {date: {slot: raw status}}
    merged = {g: {} for g in TARGETS}
    slot_set = set()
    week_start = today
    for week in range(NUM_WEEKS):
        if week > 0:
            fields = calendar_form_fields(html)
            if not fields:
                break
            fields = [(k, v) for k, v in fields if k != "action"]
            fields.insert(0, ("action", "OffsetNext"))
            html = post(session, "/yoyaku/CalendarStatusBrowser.cgi", fields)
            week_start = today + datetime.timedelta(days=7 * week)
            time.sleep(1)  # 行儀よく
        for gym, days in parse_week(html, week_start).items():
            for d, slots in days.items():
                merged[gym].setdefault(d, {}).update(slots)
                slot_set.update(slots.keys())

    gyms = []
    for name in TARGETS:
        dates = {d: {s: RAW2UI[v] for s, v in sorted(slots.items())}
                 for d, slots in sorted(merged[name].items())}
        gyms.append({"id": name, "name": name, "dates": dates})

    out = {
        "updated": datetime.datetime.now(
            datetime.timezone(datetime.timedelta(hours=9))).isoformat(timespec="minutes"),
        "source": f"{BASE}/yoyaku/ShisetsuMultiSelect.cgi",
        "note": "あじさいネット（神戸市 施設予約）の空き状況照会より自動取得。○=空き ×=予約済み 休=休館。実際の予約は公式サイトで。",
        "slots": sorted(slot_set),  # 時間帯一覧（"09:00～11:00" ... "21:00～23:00"）
        "gyms": gyms,
    }
    with open("data/availability.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    total = sum(len(g["dates"]) for g in gyms)
    print(f"OK: {len(gyms)}施設 / 日数合計 {total} を書き出しました。")


if __name__ == "__main__":
    main()
