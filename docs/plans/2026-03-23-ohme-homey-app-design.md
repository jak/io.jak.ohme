# Ohme Homey App — Design Document

## Overview

Port the [Home Assistant Ohme integration](https://www.home-assistant.io/integrations/ohme/) to a Homey app, supporting all current Ohme EV charger models. The app communicates with the Ohme cloud API (Firebase auth + REST) and exposes charger state and controls via Homey capabilities and Flow cards.

Reference implementations:
- HA integration: `/Users/jak/Code/home-assistant-core/homeassistant/components/ohme`
- Python API client: `/Users/jak/Code/ohmepy`

## Architecture

### Drivers (one per charger model)

| Driver | Device Class | Model-Gated Capabilities |
|--------|-------------|-------------------------|
| `ohme-home-pro` | `evcharger` | `lock_buttons`, `price_cap_enabled`, `require_approval`, `sleep_when_inactive` |
| `ohme-epod` | `evcharger` | `lock_buttons`, `price_cap_enabled`, `require_approval`, `sleep_when_inactive`* |
| `ohme-home` | `evcharger` | `lock_buttons`, `price_cap_enabled` |
| `ohme-go` | `evcharger` | `lock_buttons`, `price_cap_enabled` |

*ePod `sleep_when_inactive` / `require_approval` may use different API endpoints — to be verified during testing.

All drivers share a base device class with common logic. Driver-specific files are thin wrappers.

### Shared API Client (`lib/OhmeApi.ts`)

Single class handling all Ohme API communication, one instance per paired device.

**Authentication:**
- Firebase Identity Toolkit login (email + password)
- Token auto-refresh at 45-minute intervals
- `refreshToken` persisted via `device.setStoreValue()`

**Polling:**
- Charge session: 30-second interval (power, voltage, current, battery, status, mode, targets, slots)
- Device info: 5-minute interval (configuration switches, vehicle list, capabilities)

**Endpoints (ported from ohmepy):**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `googleapis.com/.../verifyPassword` | Login |
| POST | `googleapis.com/.../token` | Token refresh |
| GET | `/v1/users/me/account` | Device info, capabilities, vehicles |
| GET | `/v1/chargeSessions` | Active charge session data |
| GET | `/v1/chargeSessions/nextSessionInfo` | Next scheduled session |
| POST | `/v1/chargeSessions/{serial}/stop` | Pause charge |
| POST | `/v1/chargeSessions/{serial}/resume` | Resume charge |
| PUT | `/v1/chargeSessions/{serial}/approve?approve=true` | Approve pending charge |
| PUT | `/v2/charge-devices/{serial}/.../max-charge` | Enable/disable max charge |
| PUT | `/v1/chargeDevices/{serial}/appSettings` | Set device config |
| PUT | `/v1/car/{carId}/select` | Select vehicle |
| PUT | `/v1/chargeRules/{ruleId}` | Update charge rule (next session) |
| PATCH | `/v2/users/me/charge-rules/{ruleId}` | Update target during active session |
| GET/PUT | `/v1/users/me/settings` | User settings (price cap) |

## Capabilities

### Built-in Homey Capabilities

| Capability | Type | Purpose |
|-----------|------|---------|
| `measure_power` | number (W) | Real-time power draw |
| `measure_voltage` | number (V) | Supply voltage |
| `measure_current` | number (A) | Current draw |
| `measure_battery` | number (%) | Vehicle battery SOC |
| `meter_power` | number (kWh) | Cumulative energy |
| `evcharger_charging` | boolean | Charging on/off toggle |

### Custom Capabilities (`.homeycompose/capabilities/`)

| Capability | Type | UI Component | Details |
|-----------|------|-------------|---------|
| `charger_status` | enum | picker | Values: unplugged, plugged_in, charging, paused, pending_approval, finished |
| `charge_mode` | enum | picker | Values: max_charge, smart_charge, paused |
| `target_percentage` | number | slider | 0-100%, step 1 |
| `target_time` | string | sensor | Display-only on tile; set via Flow action |
| `preconditioning_duration` | number | slider | 0-60 min, step 5 |
| `price_cap_enabled` | boolean | toggle | Enable/disable price cap |
| `lock_buttons` | boolean | toggle | Lock physical charger buttons |
| `require_approval` | boolean | toggle | Require charge approval |
| `sleep_when_inactive` | boolean | toggle | Stealth/low-power mode |

### Per-Driver Capability Assignment

**All drivers (universal):**
`measure_power`, `measure_voltage`, `measure_current`, `measure_battery`, `meter_power`, `evcharger_charging`, `charger_status`, `charge_mode`, `target_percentage`, `target_time`, `preconditioning_duration`

**Home Pro & ePod add:** `lock_buttons`, `price_cap_enabled`, `require_approval`, `sleep_when_inactive`

**Home & Go add:** `lock_buttons`, `price_cap_enabled`

## Flow Cards

### Automatic (from capabilities)

**Triggers:** charger_status changed, evcharger_charging changed, measure_power changed, measure_battery changed

**Conditions:** charger_status is X, is charging, battery >/</= X, power >/</= X, charge_mode is X

**Actions:** set charge_mode, set target_percentage, set preconditioning_duration, toggle price_cap_enabled, toggle evcharger_charging

### Custom Flow Action Cards

| Action | Arguments | Implementation |
|--------|-----------|---------------|
| Set target time | hour (number), minute (number) | `api.setTarget({ targetTime })` |
| Approve charge | none | `api.approveCharge()` |
| Set price cap value | price (number) | `api.setPriceCap(value)` |
| Select vehicle | vehicle (autocomplete) | `api.selectVehicle(id)` |

## Pairing Flow

1. **Login** — user enters email + password (custom pairing view)
2. App authenticates with Ohme API
3. App fetches `/v1/users/me/account` to get charger list
4. **Device list** — presents chargers matching this driver's model
5. Device created with `data: { serial }`, credentials in `store`

Model-to-driver matching uses `modelTypeDisplayName` from the API. Unknown models fail pairing with a message to report the model.

## Data Flow

```
OhmeApi (polls cloud API on intervals)
  → emits events on data change
    → Device.ts calls setCapabilityValue() for each capability
      → Homey UI updates + Flow triggers fire

Homey UI / Flow action
  → registerCapabilityListener() in Device.ts
    → calls OhmeApi control method
      → Ohme cloud API executes command
        → next poll picks up new state
```

## Platform Support

- Homey Pro (local): Yes
- Homey Cloud: Yes — all `platforms: ["local", "cloud"]`
- No local network access required (cloud-to-cloud only)
