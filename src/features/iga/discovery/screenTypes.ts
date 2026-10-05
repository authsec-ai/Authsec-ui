import type { Source, SourceScope } from "./sources";
import type { DiscoveryUrl } from "./useDiscoveryUrl";
import type { DiscoveryProvider, DiscoveryType, DiscoveryView } from "./urlState";

/** What the page hands every list screen. */
export interface ScreenProps {
  ws: string;
  url: DiscoveryUrl;
  provider: DiscoveryProvider;
  type: DiscoveryType;
  view: DiscoveryView;
  /** The provider's connections, for the Source facet. */
  sources: Source[];
  scope: SourceScope;
}
