import { redirectToAdminMapper } from './adminRedirect.ts'

// Retired standalone entry (#154). Character authoring used to be a
// self-contained page here with no auth wiring — anyone could open it. It now
// lives behind the admin-gated /admin/sprites route; bounce direct hits there
// so the same `admin` realm-role guard (RequireAdmin, #100) applies and no
// ungated authoring remains (follow-up to #151).
redirectToAdminMapper(window.location)
