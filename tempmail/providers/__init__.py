"""سجل المزوّدات المتاحة."""

from __future__ import annotations

from .base import Provider, ProviderError, random_local, random_password
from .imap_catchall import ImapCatchAllProvider, test_connection as imap_test_connection
from .mailtm import MailGwProvider, MailTmProvider
from .onesecmail import OneSecMailProvider

__all__ = [
    "Provider",
    "ProviderError",
    "ProviderRegistry",
    "random_local",
    "random_password",
    "imap_test_connection",
]


class ProviderRegistry:
    """يبني المزوّدات مرة واحدة ويوفّر وصولًا موحّدًا إليها."""

    def __init__(self, settings_loader) -> None:
        self._providers: dict[str, Provider] = {}
        for provider in (
            MailTmProvider(),
            MailGwProvider(),
            ImapCatchAllProvider(settings_loader),
            OneSecMailProvider(),
        ):
            self._providers[provider.id] = provider

    def get(self, provider_id: str) -> Provider:
        provider = self._providers.get(provider_id)
        if provider is None:
            raise ProviderError(f"مزوّد غير معروف: {provider_id}")
        return provider

    def describe_all(self) -> list[dict]:
        return [p.describe() for p in self._providers.values()]

    def close(self) -> None:
        for provider in self._providers.values():
            closer = getattr(provider, "close", None)
            if callable(closer):
                closer()
