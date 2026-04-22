-- Phase 5.3: scheduled breaks + optional online-meeting link per session.
--
-- `breaks_config` stores an array of `{ afterRound: int, minutes: int }`
-- objects the setup form collected. The sessionEndTime estimator reads
-- this so the dashboard's "ends approx." label reflects both play time
-- and break time. Shape is validated in the API, not the DB -- jsonb is
-- fine here because the payload is tiny (<=12 entries) and only ever
-- read back alongside the session row.
--
-- `online_meeting_url` is surfaced to joined players on the lobby and
-- game shell when the host pastes a Zoom/Teams/Meet link for online
-- nights. Kept nullable and free-text so we aren't locked to a provider.

ALTER TABLE sessions
  ADD COLUMN breaks_config jsonb,
  ADD COLUMN online_meeting_url text;
