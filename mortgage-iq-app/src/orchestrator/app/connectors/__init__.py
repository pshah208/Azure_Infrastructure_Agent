"""IQ connectors.

Each connector represents one of the four Microsoft IQs and exposes a single
``run`` coroutine. In MOCK mode it returns canned, realistic mortgage data; in
FOUNDRY mode these are the tool implementations the Foundry agent calls.

Every connector yields (detail, result) so the orchestrator can surface the
"what is this IQ doing right now" detail string to the UI.
"""

from .work_iq import WorkIQ
from .fabric_iq import FabricIQ
from .foundry_iq import FoundryIQ
from .web_iq import WebIQ

__all__ = ["WorkIQ", "FabricIQ", "FoundryIQ", "WebIQ"]
