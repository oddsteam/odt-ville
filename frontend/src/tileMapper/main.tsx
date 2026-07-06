import { redirectToAdminMapper } from './adminRedirect.ts'

// Retired standalone entry (#161, follow-up to #154). Tile-object authoring
// used to be a self-contained page here with no auth wiring — anyone could
// open it. It now lives behind the admin-gated /admin/objects route; bounce
// direct hits there so the same `admin` realm-role guard (RequireAdmin, #100)
// applies and no ungated authoring remains.
redirectToAdminMapper(window.location)
