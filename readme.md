# Positron Explorer Backend

### Setup
- See `.env.example` for the env file needed
- Set `ranges` and `numbers` fields in `syncConfig.json` file. Leave as empty array if not needed
- Both `fromBlock` and `toBlock` are inclusive in range
- All numbers must be integers, not strings

### run
#### without sync
- npm startTestnet
- npm startMainnet
#### with sync
- npm startTestnet -- --sync
- npm startMainnet -- --sync


### db
- npm run showAll -- --network mainnet

### example queries
- https://explorer.electronlabs.org/
- https://explorer.electronlabs.org/transaction/?nonce=33&source=eth
- https://testnet.explorer.electronlabs.org/list_transactions/?per_page=5&page_no=0

### Migrate db
- Set apropriate `DATABASE_URL` in the .env file
- run `npx prisma migrate dev`