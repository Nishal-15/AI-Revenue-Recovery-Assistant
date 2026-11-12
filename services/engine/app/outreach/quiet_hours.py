from datetime import datetime, time, timedelta


def is_quiet(local: datetime, start: time, end: time) -> bool:
    """Quiet hours usually wrap midnight (21:00 to 09:00); a same-day window works too."""
    now = local.time()
    if start == end:
        return False
    if start < end:
        return start <= now < end
    return now >= start or now < end


def next_send_time(local: datetime, start: time, end: time) -> datetime:
    """`local` itself when sending is allowed, otherwise the moment quiet hours end."""
    if not is_quiet(local, start, end):
        return local
    candidate = local.replace(hour=end.hour, minute=end.minute, second=0, microsecond=0)
    if candidate <= local:
        candidate += timedelta(days=1)
    return candidate
