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

## Quick start
1. Visit the website and open **Pengaturan**.
2. Select **Admin (demo)** if needed.
3. Under **Kelola scoreboard**, add two team names, match state, venue and scores. The default is 0–0.
4. Open **Jadwal pertandingan** to add matches (it begins blank).
5. Open **Rule Assistant** to try a scenario.
6. To try alerts, enable sound/vibration in **Pengaturan** and select the test button.
7. Use **Lapor insiden** for a fictional example, then review the report in **Pusat insiden**.

## Important limitations
This is a **browser-only local version**, not yet a centrally deployed event-management backend:

- The scoreboard, match schedule, incident data, and cards use browser **localStorage**, so they **DO NOT synchronize between devices**. Changing a match on Admin's phone does not update another user's phone.
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
- [ ] New local report updates the incident metrics, and workflow states move correctly.
- [ ] Vibration test works on a supported Android browser when enabled.
- [ ] On an iPhone/unsupported browser, vibration status reports unsupported and visual alert is available.
- [ ] Sound/visual test works after user interaction (device/browser permitting).
- [ ] Responsive navigation and forms work on smartphone and laptop.
- [ ] No personal real-world student data is entered.

## Collaboration
Only the repository owner controls collaborator access. Review major changes on a separate branch and merge via pull request after testing.

## For a multi-device production edition
Add a centrally secured backend (e.g. Firebase Auth + Firestore), validated role permissions, server-generated timestamps, matching event IDs, data retention rules, organizer authorization, real-time subscriptions, and Web Push/approved native notifications. A native iOS app is needed for reliable device haptics beyond ordinary web support.
