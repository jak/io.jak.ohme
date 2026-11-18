# Set vehicle battery level flow card

**Goal:** Let users push the vehicle's current state of charge to Ohme from a Homey flow,
for cars whose SoC Ohme can't read itself (e.g. a broken Tesla integration in Ohme Labs).

**API:** `PUT /v1/car/{vehicleId}/state-of-charge` with `{"currentChargePercent": <int>}`
(mirrors `ohmepy.async_set_state_of_charge`). The selected vehicle is `cars[0]` from
`/v1/users/me/account` (same assumption as ohmepy's `current_vehicle`).

## Tasks

1. **Test first** (`test/OhmeApi.test.ts`): `setStateOfCharge`
   - PUTs to `/v1/car/<cars[0].id>/state-of-charge` with `currentChargePercent`
   - rounds non-integer input; rejects values outside 0–100
   - throws when there is no vehicle on the account
2. **Implement** `OhmeApi.setStateOfCharge(percent)` in `lib/OhmeApi.ts`.
3. **Flow card** `.homeycompose/flow/actions/set_vehicle_soc.json`: device arg (all four drivers)
   + number arg `percent` (0–100, step 1). Title "Set vehicle battery level to [[percent]]%".
4. **Wire up** in `app.ts`; after the call, refresh the charge session so `measure_battery` updates.
5. **Locales**: add `set_vehicle_soc` to all `locales/*.json`.
6. **Verify**: `npm test`, `npm run build`, `npm run lint`, `homey app validate`;
   then manual test on a real ePod with a car plugged in to confirm `measure_battery` reflects it.
