"""
NestJS 백엔드 API 클라이언트
통화 기록/장기 메모리/사용자 정보를 관리합니다.
"""

import logging
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger("api_client")


class BackendApiClient:
    """NestJS 백엔드 API와 통신하는 클라이언트"""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.client = httpx.AsyncClient(timeout=30.0)
        logger.info(f"🌐 API Client initialized: {self.base_url}")

    async def close(self):
        await self.client.aclose()

    async def get_memory_context(self, user_id: str) -> Dict[str, Any]:
        """
        통화 시작 시 최소 부트스트랩 컨텍스트를 가져옵니다.
        """
        try:
            response = await self.client.get(
                f"{self.base_url}/memory/context",
                params={"userId": user_id},
            )
            response.raise_for_status()
            result = response.json()

            if not result.get("success"):
                return {"contextText": "", "raw": result.get("data")}

            data = result.get("data", {}) or {}
            user_info = data.get("userInfo", {}) or {}
            long_term_memories = data.get("longTermMemories", []) or []

            parts = []

            if user_info:
                profile_lines = "\n".join(
                    [f"- {key}: {value}" for key, value in user_info.items()]
                )
                parts.append(f"저장된 사용자 정보:\n{profile_lines}")

            if long_term_memories:
                memory_lines = "\n".join(
                    [f"- {item.get('content', '')}" for item in long_term_memories[:6]]
                )
                parts.append(f"저장된 장기 메모리:\n{memory_lines}")

            return {
                "contextText": "\n\n".join(parts).strip(),
                "raw": data,
            }
        except httpx.HTTPStatusError as e:
            logger.error(
                f"❌ HTTP error getting context: {e.response.status_code} - {e.response.text[:200]}"
            )
            return {"contextText": "", "raw": {}}
        except Exception as e:
            logger.error(f"❌ Error getting context: {type(e).__name__}: {str(e)}")
            return {"contextText": "", "raw": {}}

    async def save_call_record(
        self,
        user_id: str,
        conversation_id: str,
        transcript: str,
        summary: Optional[str] = None,
        started_at: Optional[str] = None,
        ended_at: Optional[str] = None,
        message_count: int = 0,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        try:
            payload: Dict[str, Any] = {
                "userId": user_id,
                "conversationId": conversation_id,
                "transcript": transcript,
                "messageCount": message_count,
            }
            if summary:
                payload["summary"] = summary
            if started_at:
                payload["startedAt"] = started_at
            if ended_at:
                payload["endedAt"] = ended_at
            if metadata:
                payload["metadata"] = metadata

            response = await self.client.post(
                f"{self.base_url}/memory/call-record",
                json=payload,
            )
            response.raise_for_status()
            logger.info(f"💾 Call record saved: {conversation_id}")
            return True
        except httpx.HTTPStatusError as e:
            logger.error(
                f"❌ HTTP {e.response.status_code} saving call record: {e.response.text[:200]}"
            )
            return False
        except Exception as e:
            logger.error(f"❌ Error saving call record: {type(e).__name__}: {str(e)}")
            return False

    async def save_long_term_memories(
        self,
        user_id: str,
        conversation_id: str,
        memories: List[Dict[str, Any]],
    ) -> bool:
        if not memories:
            return True

        try:
            response = await self.client.post(
                f"{self.base_url}/memory/long-term",
                json={
                    "userId": user_id,
                    "conversationId": conversation_id,
                    "memories": memories,
                },
            )
            response.raise_for_status()
            logger.info(
                f"🧠 Long-term memories saved: {len(memories)} items for {user_id}"
            )
            return True
        except httpx.HTTPStatusError as e:
            logger.error(
                f"❌ HTTP error saving long-term memories: {e.response.status_code} - {e.response.text[:200]}"
            )
            return False
        except Exception as e:
            logger.error(
                f"❌ Error saving long-term memories: {type(e).__name__}: {str(e)}"
            )
            return False

    async def save_user_info(self, user_id: str, key: str, value: str) -> Dict[str, Any]:
        try:
            response = await self.client.post(
                f"{self.base_url}/memory/user-info",
                json={
                    "userId": user_id,
                    "key": key,
                    "value": value,
                },
            )
            response.raise_for_status()
            logger.info(f"💾 User info saved: {key} = {value}")
            return {"status": "success", "message": f"사용자 정보 '{key}'를 저장했습니다."}
        except httpx.HTTPStatusError as e:
            logger.error(
                f"❌ HTTP error saving user info: {e.response.status_code} - {e.response.text}"
            )
            return {"status": "error", "message": f"저장 실패: {e.response.status_code}"}
        except Exception as e:
            logger.error(f"❌ Error saving user info: {e}")
            return {"status": "error", "message": f"저장 실패: {str(e)}"}

    async def search_memory(
        self, user_id: str, query: str, limit: int = 5
    ) -> Dict[str, Any]:
        try:
            response = await self.client.get(
                f"{self.base_url}/memory/search",
                params={
                    "userId": user_id,
                    "q": query,
                    "limit": limit,
                },
            )
            response.raise_for_status()
            logger.info(f"🔍 Memory search: {query}")
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(
                f"❌ HTTP error searching memory: {e.response.status_code} - {e.response.text}"
            )
            return {"success": False, "data": []}
        except Exception as e:
            logger.error(f"❌ Error searching memory: {e}")
            return {"success": False, "data": []}

    async def create_calendar_event(
        self,
        user_id: str,
        title: str,
        start_time: str,
        end_time: Optional[str] = None,
        description: Optional[str] = None,
        location: Optional[str] = None,
        all_day: bool = False,
        time_zone: Optional[str] = None,
    ) -> Dict[str, Any]:
        try:
            payload: Dict[str, Any] = {
                "userId": user_id,
                "title": title,
                "startTime": start_time,
                "allDay": all_day,
            }
            if end_time:
                payload["endTime"] = end_time
            if description:
                payload["description"] = description
            if location:
                payload["location"] = location
            if time_zone:
                payload["timeZone"] = time_zone

            response = await self.client.post(
                f"{self.base_url}/calendar/event",
                json=payload,
            )
            response.raise_for_status()
            logger.info(f"📅 Calendar event created: {title}")
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(
                f"❌ HTTP error creating calendar event: {e.response.status_code} - {e.response.text}"
            )
            return {
                "success": False,
                "message": f"일정 저장 실패: {e.response.status_code}",
            }
        except Exception as e:
            logger.error(f"❌ Error creating calendar event: {e}")
            return {"success": False, "message": f"일정 저장 실패: {str(e)}"}

    async def get_user_info(self, user_id: str) -> Dict[str, Any]:
        try:
            response = await self.client.get(
                f"{self.base_url}/memory/user-info/{user_id}"
            )
            response.raise_for_status()
            data = response.json()
            logger.info(f"👤 User info retrieved for: {user_id}")
            return data
        except httpx.HTTPStatusError as e:
            logger.error(
                f"❌ HTTP error getting user info: {e.response.status_code} - {e.response.text}"
            )
            return {"profile": {}, "preferences": {}}
        except Exception as e:
            logger.error(f"❌ Error getting user info: {e}")
            return {"profile": {}, "preferences": {}}

    async def delete_memory_item(
        self, user_id: str, item_type: str, item_id_or_key: str
    ) -> Dict[str, Any]:
        try:
            if item_type == "all":
                response = await self.client.delete(
                    f"{self.base_url}/memory/user/{user_id}"
                )
            elif item_type == "user_info":
                response = await self.client.delete(
                    f"{self.base_url}/memory/user-info/{user_id}/{item_id_or_key}"
                )
            else:
                return {
                    "status": "error",
                    "message": f"알 수 없는 항목 유형: {item_type}",
                }

            response.raise_for_status()
            logger.info(f"🗑️ Memory item deleted: {item_type} - {item_id_or_key}")
            return {"status": "success", "message": f"{item_type} 항목을 삭제했습니다."}
        except httpx.HTTPStatusError as e:
            logger.error(
                f"❌ HTTP error deleting memory: {e.response.status_code} - {e.response.text}"
            )
            return {"status": "error", "message": f"삭제 실패: {e.response.status_code}"}
        except Exception as e:
            logger.error(f"❌ Error deleting memory: {e}")
            return {"status": "error", "message": f"삭제 실패: {str(e)}"}
