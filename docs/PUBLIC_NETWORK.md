# Public rooms and authenticated seats

Public matchmaking uses the same WebRTC game transport as private invitations.
Directory reservations authorize admission; they do not run the game engine.
Clients use session protocol 4 and Trystero application `virtuel21-money-tour-v22`.
Old saved signed histories remain readable, but active older clients must reload.

## Identity and seat ownership

An authenticated member's `id` is the hash of their public signing key. A game
seat keeps its original engine ID throughout a game. A late arrival therefore
gets `Member.seatId`, normally an original `bot-N` seat, rather than changing
property owners, quests, debts or historical actions.

`SessionView.self` is the controlled game seat; `selfIdentity` is the signing
identity. `host` and `connected` remain signing identities. Roster and host-only
interface actions compare `selfIdentity` with `host`. Engine actions use `self`.
Intent signatures authenticate the author and are accepted only for the seat
assigned to that author. Randomness contributions and ready checks still use
signing identities, including after host migration or a rematch.

## Reservation and transfer

The joining client calls `requestPublicSeat({expectedHostId, seatId, reservationId,
reservationToken})` before `join()`. The HTTPS match response supplies `hostId`;
it locks the expected signing identity until admission. Reservation credentials
are sent only to that host's peer, never broadcast to the other players. A
different peer claiming to be the creator cannot receive the reservation or
replace the expected host. The joining client's signature binds the room, reservation,
requested seat, identity and display name. A host must provide the asynchronous
`authorizePublicJoin` callback. Missing, rejected or unavailable authorization
fails closed. The host checks authorization again at the transfer boundary.
The reservation token is never stored in the signed action history.
Production matchmaking also pins the host signing identity returned by the HTTPS
directory before joining WebRTC. Until admission completes, other peers cannot
claim to be the creator or change that host. The reservation capability is sent
only to that host's peer connection, never broadcast to other guests. Requests
retry at most once per second; after admission normal host migration is restored.

Before a game starts, the reserved seat is `lobby`; an authorized arrival becomes
a founding member of the signed start. After the game starts, only original AI
seats that have never been assigned to a human are eligible. Human seats remain
reserved even after their controller disconnects or AI temporarily takes over.
Pending admissions expire after 45 seconds and are discarded when their peer
disconnects. A lobby reservation arriving after launch is refused so the client
can reserve an exact remaining AI seat.

An in-progress transfer waits for the engine's `roll` phase, with no active
introduction, random ceremony, presentation or winner. The host serializes a
`join_seat` command containing the new member and their consent. All peers verify
it against the available seat and signed history. The command switches control,
updates the display name and preserves the seat's money, properties and progress.
`GameState.publicSeats` binds the controller identity to the verified state hash;
different ownership grants cannot share the same accepted state hash.

An initial snapshot replays founding members, then applies signed admissions in
order. The member list is append-only, bounded by four identities. New arrivals
acknowledge the synchronized head before joining random contributions. Existing
human-seat recovery uses the original identity and its assigned seat.

## Transparency and trust

AI participants receive natural display names. Their `bot` flag remains true in
the engine, and the public-room interface discloses AI participation. Public-room
status is signed in the start and retained through recovery and rematches.

The host still owns liveness, timing and bot policy; this is not a competitive
anti-cheat protocol. Directory availability does not prove WebRTC connectivity.
Real Android/Capacitor, background recovery and Wi-Fi to mobile-network validation
remain separate from in-memory and browser tests.
