# Security Specification — Alderbrook AI Town

## 1. Data Invariants
1. A `/towns/{townId}` document can only be created, read, updated, or deleted by the authenticated, email-verified user whose `request.auth.uid == townId` and `ownerId == request.auth.uid`.
2. Every `/towns/{townId}/agents/{agentId}`, `/towns/{townId}/structures/{plotId}`, and `/towns/{townId}/logs/{logId}` subcollection document must belong to an existing parent `/towns/{townId}` document owned by `request.auth.uid` (Master Gate via `get()`), and its `ownerId` must equal `request.auth.uid`.
3. `ownerId` and `createdAt` are immutable once created. `createdAt` and `updatedAt` must strictly equal `request.time`.
4. All document IDs (`townId`, `agentId`, `plotId`, `logId`) must pass `isValidId()` (`^[a-zA-Z0-9_-]+$`, `<= 128` chars), and `agentId` is capped at `<= 40` chars to allow core council members and dynamically hired specialists (up to 15 active villagers, `activeAgentIndex` `0..14`).
5. All string fields enforce explicit `.size()` bounds and enum fields (`location`, `activePlotId`, `assignedPlotId`, `hatStyle`, `plotId`, `structureType`, `status`, `weather`) and hex color strings (`^#[0-9a-fA-F]{6}$`) enforce explicit allowlists and patterns.
6. Town structures (`/structures/{plotId}`) enforce bounded integers (`progress` 0..100, `tier` 1..3), immutable `plotId` and `structureType`, and cannot revert `status` from `'complete'` back to `'building'`.
7. Town logs (`/logs/{logId}`, including `agentId: "weather_shift"` and `agentId: "remote_command"`) are append-only (no `update` allowed; `delete` allowed only by town owner for town reset).
8. Remote commands (`/remoteCommands/{commandId}`) restrict `type` to `['set_weather', 'hire_worker', 'god_decree', 'build_structure', 'build_plot']`, require `status: 'pending'` on client create, enforce terminal state locking once `'executed'` or `'failed'`, and restrict updates to `['status', 'executedAt', 'resultMessage']` with server `request.time`.
9. Town stores (`/economy/stores`) are a single fixed document (`docId == 'stores'`) writable only by the parent-town owner. All four amounts (`timber`, `stone`, `food`, `gold`) are bounded integers (`0..100000`), `ownerId` and `createdAt` are immutable, updates may only touch the four amounts plus `updatedAt`, and the collection is not listable.

## 2. Dirty Dozen Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. Unauthenticated read of `/towns/user123`.
2. Unverified email user creating `/towns/user123` (`email_verified: false`).
3. Identity spoofing: User A creating `/towns/userB` with `ownerId: "userB"`.
4. Shadow field injection: Creating `/towns/userA/structures/plot_nw` or `/towns/userA/remoteCommands/cmd1` with extra key `isFree: true`.
5. Client-forged timestamp: Creating `/towns/userA/remoteCommands/cmd1` with `createdAt` set to a past client date instead of `request.time`.
6. Owner mutation on update: Updating `/towns/userA/structures/plot_nw` to change `ownerId` to `"userB"`.
7. Invalid enum/color value: Setting `type: "shell_exec"` on `/towns/userA/remoteCommands/cmd1`, `hatStyle: "crown"`, or `coatColor: "red"`.
8. Oversized string poisoning: Setting `activeDecree` or `remoteCommands.value` to 5000 characters.
9. Path ID poisoning: Creating `/towns/userA/remoteCommands/bad..id!@#` with invalid characters.
10. Orphaned subcollection write: Creating `/towns/nonexistent/remoteCommands/cmd1`.
11. Cross-tenant query: User B listing `/towns/userA/remoteCommands`.
12. Terminal state / structure tampering: Reverting `/towns/userA/remoteCommands/cmd1` from `status: "executed"` back to `status: "pending"`, or tampering with `type`/`value` during execution update.
