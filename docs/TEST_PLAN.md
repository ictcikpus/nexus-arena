# Test and release plan

User requested not to run the game locally. The following are post-deploy acceptance checks performed from browsers, not local development tests.

1. Open the public URL on desktop and phone.
2. Player A creates a private room and shares its code.
3. Player B joins using the same game URL and room code.
4. Both press Ready; countdown should begin.
5. Confirm both clients display each other's avatar and movement.
6. Jump over at least one barrier and cross a gap; confirm checkpoint/respawn.
7. Finish with both players; confirm results agree.
8. Open a third browser tab to verify additional player joins; repeat up to eight tabs/devices if practical.
9. Join a ninth client and confirm the server rejects it.
10. Disconnect one client and check that the room remains usable by others.
11. If anything fails, inspect Render logs and the browser console; do not publish as a competitive production game until issues are fixed.
