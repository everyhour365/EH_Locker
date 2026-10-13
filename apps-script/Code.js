/**
 * EH Locker System — Apps Script 웹앱 (백엔드)
 *
 * 스터디모아 사물함 현황을 읽어 프론트(index.html)에 내려주고,
 * 만료돼서 사라지는 이용자 정보(이름/번호)를 마지막으로 본 값으로 보관한다.
 *
 * 계정은 Config.js(로컬 전용, git 제외)에 두고 clasp push로 올린다.
 * 스크립트 속성에 같은 이름이 있으면 그 값이 우선:
 *   SM_ID_SEONGSU / SM_PW_SEONGSU   성수점 스터디모아 관리자 계정
 *   SM_ID_GUUI    / SM_PW_GUUI      구의점 스터디모아 관리자 계정
 *   ACCESS_KEY                      프론트 접속 키 (전화번호가 내려가므로 필수 권장)
 */

var SM_BASE = "https://admin-api.studymoa.me";
var SM_ORIGIN = "https://admin.studymoa.me";
var BRANCHES = {
  seongsu: { name: "성수점", placeSeq: 5333, idKey: "SM_ID_SEONGSU", pwKey: "SM_PW_SEONGSU" },
  guui:    { name: "구의점", placeSeq: 5348, idKey: "SM_ID_GUUI",    pwKey: "SM_PW_GUUI" }
};
var DATA_CACHE_SEC = 120;   // 스터디모아 호출 최소화 (fresh=true면 우회)
var SENT_KEEP_DAYS = 60;

function props_() { return PropertiesService.getScriptProperties(); }

// ─── 웹앱 엔트리 ────────────────────────────────────────────────────────────
function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    var needKey = props_().getProperty("ACCESS_KEY") || (typeof ACCESS_KEY_DEFAULT !== "undefined" ? ACCESS_KEY_DEFAULT : "");
    if (needKey && req.key !== needKey) {
      out = { ok: false, error: "unauthorized" };
    } else if (req.action === "lockers") {
      out = { ok: true, data: getLockers_(!!req.fresh), sent: getSent_(), emptied: getEmptied_(), paid: getPaid_(), alimtalk: solapiReady_() };
    } else if (req.action === "markSent") {
      markSent_(req.branch, req.lockerNo, req.endDate);
      out = { ok: true, sent: getSent_() };
    } else if (req.action === "markEmpty") {
      markEmpty_(req.branch, req.lockerNo, req.endDate, !!req.empty);
      out = { ok: true, emptied: getEmptied_() };
    } else if (req.action === "sendAlimtalk") {
      out = sendLockerAlimtalk_(req);
    } else if (req.action === "markPaid") {
      markPaid_(req.branch, req.lockerNo, req.endDate, !!req.paid);
      out = { ok: true, paid: getPaid_() };
    } else {
      out = { ok: false, error: "unknown action" };
    }
  } catch (err) {
    out = { ok: false, error: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput("EH Locker System OK");
}

// ─── 스터디모아 ─────────────────────────────────────────────────────────────
function login_(id, pw) {
  var res = UrlFetchApp.fetch(SM_BASE + "/api/manager/login", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ id: id, password: pw }),
    muteHttpExceptions: true
  });
  var json = JSON.parse(res.getContentText());
  if (json.result !== "success" || !json.access_token) throw new Error("스터디모아 로그인 실패");
  return json.access_token;
}

// 토큰 1시간 캐시 (로그인 호출 최소화)
function getToken_(branchId, forceNew) {
  var p = props_();
  var cfg = BRANCHES[branchId];
  var k = "TOKEN_" + branchId;
  var saved = Number(p.getProperty(k + "_AT") || 0);
  var cached = p.getProperty(k);
  if (!forceNew && cached && Date.now() - saved < 3600 * 1000) return cached;
  var acc = (typeof SM_ACCOUNTS !== "undefined" && SM_ACCOUNTS[branchId]) || {};
  var id = p.getProperty(cfg.idKey) || acc.id, pw = p.getProperty(cfg.pwKey) || acc.pw;
  if (!id || !pw) throw new Error(cfg.name + " 계정이 스크립트 속성에 없습니다");
  var t = login_(id, pw);
  p.setProperty(k, t);
  p.setProperty(k + "_AT", String(Date.now()));
  return t;
}

function fetchLocker_(branchId) {
  var cfg = BRANCHES[branchId];
  function call(token) {
    return UrlFetchApp.fetch(SM_BASE + "/api/locker/" + cfg.placeSeq + "?incUsage=true", {
      method: "get",
      headers: { Authorization: "Bearer " + token, Access_token: token, Origin: SM_ORIGIN, Referer: SM_ORIGIN + "/" },
      muteHttpExceptions: true
    });
  }
  var res = call(getToken_(branchId, false));
  if (res.getResponseCode() === 401) res = call(getToken_(branchId, true));
  if (res.getResponseCode() !== 200) throw new Error(cfg.name + " 사물함 조회 실패 " + res.getResponseCode());
  return JSON.parse(res.getContentText());
}

// ─── 데이터 가공 ────────────────────────────────────────────────────────────
function getLockers_(fresh) {
  var cache = CacheService.getScriptCache();
  if (!fresh) {
    var hit = cache.get("lockers");
    if (hit) return JSON.parse(hit);
  }
  var out = { updatedAt: Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm") };
  Object.keys(BRANCHES).forEach(function (id) {
    var raw = fetchLocker_(id);
    var usage = raw.usage || [];
    out[id] = {
      name: BRANCHES[id].name,
      totalCount: (raw.layout && raw.layout.totalCount) || 0,
      usageCount: usage.length,
      layout: (raw.layout && raw.layout.layoutJson && raw.layout.layoutJson[0]) || null,
      info: (raw.info || []).map(function (i) { return { lockerNo: String(i.lockerNo), maxEndDT: i.maxEndDT }; }),
      usage: usage.map(function (u) {
        return {
          lockerNo: String(u.lockerNo), startDT: u.startDT, endDT: u.endDT,
          extendCount: u.extendCount || 0,
          name: (u.member && u.member.name) || "", phone: (u.member && u.member.phone) || ""
        };
      }),
      lastKnown: updateLastKnown_(id, usage)
    };
  });
  var s = JSON.stringify(out);
  if (s.length < 90000) cache.put("lockers", s, DATA_CACHE_SEC);
  return out;
}

// 만료되면 usage에서 이용자가 사라지므로 마지막으로 본 이용자를 보관
function updateLastKnown_(branchId, usage) {
  var p = props_();
  var k = "LAST_KNOWN_" + branchId;
  var map = {};
  try { map = JSON.parse(p.getProperty(k) || "{}"); } catch (e) {}
  usage.forEach(function (u) {
    map[String(u.lockerNo)] = {
      name: (u.member && u.member.name) || "",
      phone: (u.member && u.member.phone) || "",
      endDT: u.endDT,
      extendCount: u.extendCount || 0
    };
  });
  p.setProperty(k, JSON.stringify(map));
  return map;
}

// ─── 문자 발송 기록 (중복 발송 방지용 표시) ─────────────────────────────────
function getSent_() {
  var log = {};
  try { log = JSON.parse(props_().getProperty("SENT_LOG") || "{}"); } catch (e) {}
  return log; // { "branch|lockerNo|endDate": "yyyy-MM-dd HH:mm" }
}

function markSent_(branch, lockerNo, endDate) {
  var log = getSent_();
  var now = new Date();
  log[branch + "|" + lockerNo + "|" + endDate] = Utilities.formatDate(now, "Asia/Seoul", "yyyy-MM-dd HH:mm");
  var limit = now.getTime() - SENT_KEEP_DAYS * 86400000;
  Object.keys(log).forEach(function (k) {
    if (new Date(log[k].replace(" ", "T") + ":00+09:00").getTime() < limit) delete log[k];
  });
  props_().setProperty("SENT_LOG", JSON.stringify(log));
}

// ─── 비움 처리 (짐을 뺀 칸) / 입금 확인 ─────────────────────────────────────
// 둘 다 키에 만료일을 포함하므로 연장/재이용으로 만료일이 바뀌면 자동으로 해제된다.
function getLog_(propKey) {
  var log = {};
  try { log = JSON.parse(props_().getProperty(propKey) || "{}"); } catch (e) {}
  return log; // { "branch|lockerNo|endDate": "yyyy-MM-dd HH:mm" }
}

function setLog_(propKey, branch, lockerNo, endDate, on) {
  var log = getLog_(propKey);
  var key = branch + "|" + lockerNo + "|" + endDate;
  var now = new Date();
  if (on) log[key] = Utilities.formatDate(now, "Asia/Seoul", "yyyy-MM-dd HH:mm");
  else delete log[key];
  var limit = now.getTime() - SENT_KEEP_DAYS * 86400000;
  Object.keys(log).forEach(function (k) {
    if (new Date(log[k].replace(" ", "T") + ":00+09:00").getTime() < limit) delete log[k];
  });
  props_().setProperty(propKey, JSON.stringify(log));
}

function getEmptied_() { return getLog_("EMPTIED_LOG"); }
function markEmpty_(branch, lockerNo, endDate, empty) { setLog_("EMPTIED_LOG", branch, lockerNo, endDate, empty); }
function getPaid_() { return getLog_("PAID_LOG"); }
function markPaid_(branch, lockerNo, endDate, paid) { setLog_("PAID_LOG", branch, lockerNo, endDate, paid); }

// ─── 솔라피 알림톡 ──────────────────────────────────────────────────────────
// 설정은 스크립트 속성 우선, 없으면 Config.js의 SOLAPI. IoT 시스템과 같은 키/발신번호/채널(PFID)을 쓰고
// 템플릿 ID만 사물함용을 따로 둔다.
//   SOLAPI_API_KEY / SOLAPI_API_SECRET / SOLAPI_FROM
//   SOLAPI_PFID_<지점>            카카오 채널 ID (지점별)
//   SOLAPI_LOCKER_TPL_<지점>      사물함 입금 안내 템플릿 ID (지점별, 승인 후 입력)
// 템플릿 변수: #{번호} #{만료일} #{연장일} #{금액} #{계좌}  (지점명은 템플릿에 고정)
var EXTEND_DAYS = 28;

function solapiProp_(k) {
  var v = props_().getProperty(k);
  if (v) return v;
  return (typeof SOLAPI !== "undefined" && SOLAPI[k]) || "";
}

function solapiReady_() {
  var base = !!(solapiProp_("SOLAPI_API_KEY") && solapiProp_("SOLAPI_API_SECRET") && solapiProp_("SOLAPI_FROM"));
  var r = {};
  Object.keys(BRANCHES).forEach(function (id) {
    r[id] = base && !!solapiProp_("SOLAPI_PFID_" + id) && !!solapiProp_("SOLAPI_LOCKER_TPL_" + id);
  });
  return r;
}

function solapiSend_(branch, phone, variables) {
  var apiKey = solapiProp_("SOLAPI_API_KEY"), apiSecret = solapiProp_("SOLAPI_API_SECRET");
  var date = new Date().toISOString();
  var salt = Utilities.getUuid().replace(/-/g, "");
  var sig = Utilities.computeHmacSha256Signature(date + salt, apiSecret);
  var signature = sig.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? "0" + v : v; }).join("");
  var res = UrlFetchApp.fetch("https://api.solapi.com/messages/v4/send", {
    method: "post", contentType: "application/json",
    headers: { Authorization: "HMAC-SHA256 apiKey=" + apiKey + ", date=" + date + ", salt=" + salt + ", signature=" + signature },
    payload: JSON.stringify({
      message: {
        to: phone, from: solapiProp_("SOLAPI_FROM"), type: "ATA",
        kakaoOptions: { pfId: solapiProp_("SOLAPI_PFID_" + branch), templateId: solapiProp_("SOLAPI_LOCKER_TPL_" + branch), variables: variables }
      }
    }),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    var msg = res.getContentText();
    try { msg = JSON.parse(msg).errorMessage || msg; } catch (e) {}
    throw new Error("솔라피 발송 실패(" + code + "): " + msg);
  }
}

// 번호는 서버가 가진 데이터에서 찾는다 (클라이언트가 임의 번호로 보내지 못하게)
function sendLockerAlimtalk_(req) {
  var branch = req.branch, no = String(req.lockerNo), endDate = String(req.endDate || "");
  if (!BRANCHES[branch]) return { ok: false, error: "unknown branch" };
  if (!solapiReady_()[branch]) return { ok: false, error: "알림톡 미설정 (솔라피 키/템플릿)" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return { ok: false, error: "invalid endDate" };
  var b = getLockers_(false)[branch];
  var u = (b.usage || []).filter(function (x) { return x.lockerNo === no; })[0] || (b.lastKnown || {})[no];
  var phone = u && String(u.phone || "").replace(/\D/g, "");
  if (!phone) return { ok: false, error: "이용자 번호 없음" };
  var d = new Date(endDate + "T00:00:00+09:00");
  var newEnd = Utilities.formatDate(new Date(d.getTime() + EXTEND_DAYS * 86400000), "Asia/Seoul", "yyyy-MM-dd");
  solapiSend_(branch, phone, {
    "#{번호}": no, "#{만료일}": endDate, "#{연장일}": newEnd,
    "#{금액}": String(req.price || "").slice(0, 30), "#{계좌}": String(req.account || "").slice(0, 60)
  });
  markSent_(branch, no, endDate);
  return { ok: true, sent: getSent_() };
}

// ─── 에디터에서 1회 실행해 동작 확인 ────────────────────────────────────────
function debugRun() {
  var d = getLockers_(true);
  Logger.log(Object.keys(BRANCHES).map(function (id) {
    return d[id].name + " 이용 " + d[id].usageCount + "/" + d[id].totalCount;
  }).join(" | "));
}
