"""Checks that GEMINI_API_KEY and GEMINI_MODEL in .env work, using two realistic messages.

    .venv/Scripts/python -m scripts.check_gemini      (Windows)
    .venv/bin/python -m scripts.check_gemini          (macOS / Linux)

Prints what Gemini understood. Never prints the key.
"""

import asyncio
import sys

from app.ai.enquiries import classify_enquiry
from app.ai.llm import AiUnavailableError, GeminiLlm
from app.ai.replies import ReplyContext, analyze_reply
from app.config import get_settings


async def main() -> int:
    settings = get_settings()
    if not settings.gemini_api_key:
        print("GEMINI_API_KEY is not set in services/engine/.env")
        return 1
    llm = GeminiLlm(api_key=settings.gemini_api_key.get_secret_value(), model=settings.gemini_model)
    print(f"Model: {settings.gemini_model}")
    try:
        enquiry = await classify_enquiry(llm, "Hi, my tooth is swollen and really painful since last night. Can I come today?")
        print(f"Enquiry  -> {enquiry.model_dump()}")
        reply = await analyze_reply(
            llm,
            ReplyContext(
                clinic_name="Smile Studio Dental",
                patient_first_name="Ananya",
                our_last_message="Hi Ananya, your implant consultation is booked for Fri 13 Nov, 10:30 am. Please tap Confirm.",
                patient_message="Can I come on Saturday morning instead?",
            ),
        )
        print(f"Reply    -> {reply.model_dump()}")
    except AiUnavailableError as error:
        print(f"Gemini call failed: {error}")
        return 1
    print("Gemini is working.")
    return 0


if __name__ == "__main__":
    # Windows consoles default to a legacy code page that cannot print emoji in drafted replies.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(asyncio.run(main()))
