# Physical devices, networks and pilot evidence

Status: **pending**. The user confirmed no field-test results or participating cafes are available. Browser emulation and captured provider transports cannot pass these checks.

For every physical-device run record date, tester, staging deployment, device model, OS/browser version, network and result with a private evidence reference. Use synthetic accounts and the tester's own push registration; never a customer audience.

| Step | Android Chrome | iPhone Safari / installed Home Screen |
| --- | --- | --- |
| Open printed cafe QR, correct branch, sign in, join through referral | Pending | Pending |
| Decline installation/push; card, reward and offers still usable | Pending | Pending |
| Install once; stable app identity, icon and start route | Pending | Pending |
| Request camera on tap; scan a physical earning QR and typed fallback | Pending | Pending |
| Purchase at 2x, show exact referral effects, redeem and refund-after-spend | Pending | Pending |
| Foreground registration challenge; background receipt and authorized click | Pending | Pending |
| Logout A / sign in B; old cached card and late push generation never appear | Pending | Pending |
| Withdraw consent before queued send; expired offer click shows useful state | Pending | Pending |
| Intermittent mobile data, uncertain commit/retry, airplane mode (no writes) | Pending | Pending |
| App update during checkout waits for safe refresh | Pending | Pending |
| Native WhatsApp opens intended test chat and text; staff manually sends | Pending | Pending |
| 200% text, keyboard/switch navigation and TalkBack/VoiceOver labels/errors | Pending | Pending |

Measure equivalent Singapore (sin1 / ap-southeast-1) and Mumbai (bom1 / ap-south-1) isolated stacks before selecting production. Use the same build, dataset and concurrent workload. Singapore remains provisional. No regional stack purchase/provisioning or production launch is authorized by the brief alone.

For Karachi, Lahore and Islamabad, obtain both fixed broadband and mobile coverage where testers are available. Record city, provider/network label, date, regional stack, sample count, p50/p95, error count and measurement boundary. Public first/warm requests, login, card, scanner, purchase, redemption and reports must be distinguished. `scripts/measure-phase9-network.mjs` measures anonymous HTTP responses only; authenticated flow timing requires the staging acceptance harness/observed browser sessions. Do not call a workstation measurement Pakistan field evidence based on its configured timezone.

Record server-to-database timings separately. For browser load, capture throttling/CPU settings and lab LCP/CLS; field INP and p75 targets need actual user interactions/data. A local pass does not settle mobile performance or hosted capacity. Fill `config/pilot-evidence.json` only with observed values and references, then rebuild the dashboard.

Before broader rollout: at least three actual cafes complete the pilot, no critical/high security or accounting defects remain, signup/checkout friction has been reviewed and retested, provider/device checks are recorded, and the launch gates are verified. A checklist document is not evidence that its steps happened.
