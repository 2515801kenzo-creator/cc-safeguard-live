# CC SafeGuard Live

An interactive mini-soccer match-operations dashboard for CC Cup XLI, maintained in the repository owner's GitHub account.

**Website:** https://2515801kenzo-creator.github.io/cc-safeguard-live/

## Features
- **Match Control Center:** clean dashboard, incident metrics, quick actions and upcoming matches.
- **Scoreboard:** defaults to **0–0** with **Tim A / Tim B** as placeholders. Admin (demo) can assign names, score, match state, and venue via **Pengaturan**.
- **Schedule:** empty at first. Admin (demo) can add matches with team names, date, time and venue, and delete entries.
- **Incident reporting:** category, priority, objective chronology and a local handling flow.
- **Rule Assistant:** decision-support guidance for typical situations and safety priorities; it never substitutes for the referee's official decision or the competition SOP.
- **CardSync:** records confirmed cards by team, jersey number and match code; tracks two yellows and prevents an additional card after a recorded red for that player in the same match.
- **Notifications:** opt-in vibration on compatible devices, opt-in sound and a visual alert for new local incident reports. Includes an alert test button.
- **Statistics:** counts and local CSV export.

## Daily incident archive (auto-organized by date)
- **Dashboard** and **Insiden Hari Ini** show only reports created on the current local calendar day.
- At midnight (or when the page is resumed the next day), yesterday's reports disappear from today's feed **without being deleted**.
- **Riwayat Insiden** groups older cases into expandable date folders such as **Rabu, 28 Oktober 2026**. Dates are generated from the actual report timestamp; they are not manually hard-coded.
- The archive includes search, status filters, total reports, number of archived days, and unresolved cases.
- Archived unfinished incidents remain actionable, with their status changes appended to the existing activity log.
- Older records created before this feature are assigned a date from their original timestamp or encoded report ID where possible. If no reliable date exists, they are kept in **Tanggal tidak diketahui** rather than discarded.
- **Statistik** supports today, the last seven days, or all dates. CSV exports use that selected period.
- **Pengaturan → Backup JSON** exports local incidents, cards, match setup and schedules. **Pulihkan backup** imports a compatible v3 JSON file after validation and explicit confirmation. Refresh after restoring to reload match and schedule panels.

**Important:** the archive is a logical view into browser localStorage, not individual directories or a persistent server database. The original data survives daily rollover, but can be lost if browser site data is erased or the device/browser profile is changed. Make backups; never enter sensitive information about students.

## Quick start
1. Visit the website and open **Pengaturan**.
2. Select **Admin (demo)** if needed.
3. Under **Kelola scoreboard**, add two team names, match state, venue and scores. The default is 0–0.
4. Open **Jadwal pertandingan** to add matches (it begins blank).
5. Open **Rule Assistant** to try a scenario. Open **Riwayat Insiden** to inspect older reports grouped by date.
6. To try alerts, enable sound/vibration in **Pengaturan** and select the test button.
7. Use **Lapor insiden** for a fictional example, then review the report in **Pusat insiden**.

## Important limitations
This is a **browser-only local version**, not yet a centrally deployed event-management backend:

- The scoreboard, match schedule, incident data, incident history, and cards use browser **localStorage**, so they **DO NOT synchronize between devices**. Changing a match on Admin's phone does not update another user's phone.
- **Admin (demo)** is a UI role selector, **not secure authentication or authorization**.
- There are **no remote push alerts** or background notifications. Alerts run on the local active page.
- A website cannot force haptic vibration on all devices. Browser Vibration API support is device-specific; iOS Safari/iPhone browsers generally do not support web-page vibration. Sound/visual alerts are the fallback, and sound may need user interaction.
- Rule Assistant supplies **general situational guidance**, not official interpretations, disciplinary rulings, a video-analysis AI, or legal advice. Consult the current CC Cup SOP, referee, and event organizer.
- Do not use this page as an official safety channel or emergency response service. For real emergencies contact qualified staff immediately.
- Do not enter personal data about minors, allegations, private contacts or other sensitive event information.
- Do not represent the project as officially endorsed by the school or event unless permission is granted.

## Technical files
- `index.html`: main HTML, legacy incident workflow and CardSync.
- `ui-v2.css`: interface improvements, responsive navigation and match layout.
- `features-v2.js`: scoreboard, schedule, rule guidance and audio/visual/vibration alerts.

## Publish with GitHub Pages
In the repository: **Settings → Pages → Deploy from a branch → main → /(root) → Save**.

## Suggested acceptance checklist
- [ ] Dashboard initial state shows **0–0**, placeholder teams, empty schedule, and no fabricated incidents.
- [ ] Admin updates scoreboard and refresh preserves it in the same browser.
- [ ] Admin adds two schedule items; they display chronologically and can be deleted.
- [ ] Rule Assistant provides guidance for injury and red-card scenarios without assigning official blame.
- [ ] New local report updates today's incident metrics, and workflow states move correctly.
- [ ] After the device date changes, past-day cases move to date-grouped history without losing chronology or unresolved workflow.
- [ ] History searches across dates, date folders expand and collapse, and archives show unresolved totals.
- [ ] Statistics respond to period changes, scoped CSV exports correctly, and JSON backup/restore works on clean test data.
- [ ] Vibration test works on a supported Android browser when enabled.
- [ ] On an iPhone/unsupported browser, vibration status reports unsupported and visual alert is available.
- [ ] Sound/visual test works after user interaction (device/browser permitting).
- [ ] Responsive navigation and forms work on smartphone and laptop.
- [ ] No personal real-world student data is entered.

## Collaboration
Only the repository owner controls collaborator access. Review major changes on a separate branch and merge via pull request after testing.

## For a multi-device production edition
Add a centrally secured backend (e.g. Firebase Auth + Firestore), validated role permissions, server-generated timestamps, matching event IDs, data retention rules, organizer authorization, real-time subscriptions, and Web Push/approved native notifications. A native iOS app is needed for reliable device haptics beyond ordinary web support.
