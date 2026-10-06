"""EXT-001 短信适配：mock 只写日志；aliyun 走号码认证 SendSmsVerifyCode，ACS3 自签名 HTTP，禁止 SDK。"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from datetime import UTC, datetime
from urllib.parse import quote, urlparse
from uuid import uuid4

import httpx
from pycore.core.logger import get_logger
from src.config.settings import get_settings

logger = get_logger()

# EXT-001 协议常量（技术方案 §二）
ACS_ALGORITHM = "ACS3-HMAC-SHA256"
ACS_ACTION = "SendSmsVerifyCode"
ACS_VERSION = "2017-05-25"
RESET_CODE_DIGITS = 6


class SmsChannelError(Exception):
    def __init__(self, error: str) -> None:
        super().__init__(error)
        self.error = error


def generate_numeric_code() -> str:
    upper = 10**RESET_CODE_DIGITS
    return f"{secrets.randbelow(upper):0{RESET_CODE_DIGITS}d}"


def _percent_code(value: str) -> str:
    return quote(value, safe="~")


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _canonical_headers(headers: dict[str, str]) -> tuple[str, str]:
    items = sorted((name.lower(), value.strip()) for name, value in headers.items())
    signed = ";".join(name for name, _ in items)
    canonical = "".join(f"{name}:{value}\n" for name, value in items)
    return canonical, signed


def _acs3_authorization(
    *,
    method: str,
    canonical_uri: str,
    canonical_query: str,
    headers: dict[str, str],
    payload: bytes,
    access_key_id: str,
    access_key_secret: str,
) -> str:
    hashed_payload = _sha256_hex(payload)
    headers = {**headers, "x-acs-content-sha256": hashed_payload}
    canonical_headers, signed_headers = _canonical_headers(headers)
    canonical_request = (
        f"{method}\n{canonical_uri}\n{canonical_query}\n"
        f"{canonical_headers}\n{signed_headers}\n{hashed_payload}"
    )
    string_to_sign = f"{ACS_ALGORITHM}\n{_sha256_hex(canonical_request.encode('utf-8'))}"
    signature = hmac.new(
        access_key_secret.encode("utf-8"),
        string_to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return (
        f"{ACS_ALGORITHM} Credential={access_key_id},"
        f"SignedHeaders={signed_headers},Signature={signature}"
    )


def _validity_minutes(ttl_seconds: int) -> str:
    return str(max(1, (ttl_seconds + 59) // 60))


def _form_body(fields: dict[str, str]) -> bytes:
    encoded = []
    for key in sorted(fields):
        encoded.append(f"{_percent_code(key)}={_percent_code(fields[key])}")
    return "&".join(encoded).encode("utf-8")


async def send_aliyun_sms(phone: str, code: str) -> None:
    settings = get_settings()
    endpoint = settings.aliyun_sms_endpoint
    parsed = urlparse(endpoint)
    host = parsed.netloc
    if not host:
        raise SmsChannelError("短信通道配置无效")
    template_param = json.dumps(
        {
            settings.aliyun_sms_template_param_key: code,
            "min": _validity_minutes(settings.password_reset_ttl_seconds),
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    payload = _form_body(
        {
            "PhoneNumber": phone,
            "SignName": settings.aliyun_sms_sign_name,
            "TemplateCode": settings.aliyun_sms_template_code,
            "TemplateParam": template_param,
        }
    )
    utc_now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    headers = {
        "host": host,
        "content-type": "application/x-www-form-urlencoded",
        "x-acs-action": ACS_ACTION,
        "x-acs-version": ACS_VERSION,
        "x-acs-date": utc_now,
        "x-acs-signature-nonce": str(uuid4()),
    }
    authorization = _acs3_authorization(
        method="POST",
        canonical_uri="/",
        canonical_query="",
        headers=headers,
        payload=payload,
        access_key_id=settings.aliyun_sms_access_key_id,
        access_key_secret=settings.aliyun_sms_access_key_secret,
    )
    request_headers = {
        "Host": host,
        "Content-Type": "application/x-www-form-urlencoded",
        "x-acs-action": ACS_ACTION,
        "x-acs-version": ACS_VERSION,
        "x-acs-date": utc_now,
        "x-acs-signature-nonce": headers["x-acs-signature-nonce"],
        "x-acs-content-sha256": _sha256_hex(payload),
        "Authorization": authorization,
    }
    url = f"{parsed.scheme}://{host}/"
    timeout = settings.aliyun_sms_timeout_seconds
    try:
        async with httpx.AsyncClient(trust_env=False, timeout=timeout) as client:
            response = await client.post(url, headers=request_headers, content=payload)
    except httpx.HTTPError as exc:
        logger.error("调用阿里云发送短信失败", detail=str(exc))
        raise SmsChannelError("短信发送失败，请稍后重试") from exc
    try:
        body = response.json()
    except ValueError as exc:
        logger.error("阿里云短信响应不是 JSON", status_code=response.status_code)
        raise SmsChannelError("短信发送失败，请稍后重试") from exc
    if response.status_code != 200 or body.get("Code") != "OK":
        logger.error(
            "阿里云发送短信未成功",
            status_code=response.status_code,
            aliyun_code=body.get("Code"),
        )
        raise SmsChannelError("短信发送失败，请稍后重试")
    model = body.get("Model")
    biz_id = body.get("BizId")
    if isinstance(model, dict) and not biz_id:
        biz_id = model.get("BizId")
    logger.info("调用阿里云发送短信成功", has_biz_id=bool(biz_id))


async def send_reset_code(phone: str, code: str) -> None:
    settings = get_settings()
    if settings.sms_mode == "mock":
        logger.info("找回密码验证码已生成（mock，不调用阿里云）", reset_code=code)
        return
    if settings.sms_mode == "aliyun":
        if not settings.aliyun_sms_access_key_id or not settings.aliyun_sms_access_key_secret:
            logger.error("阿里云短信密钥未配置，无法发送验证码")
            raise SmsChannelError("短信通道未配置")
        await send_aliyun_sms(phone, code)
        return
    logger.error("短信模式无效", sms_mode=settings.sms_mode)
    raise SmsChannelError("短信通道未配置")
