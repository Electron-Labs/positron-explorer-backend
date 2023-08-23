# Positron Explorer Backend

### Setup
- See `.env.example` for the env file needed
- Set `ranges` and `numbers` fields in `syncConfig.json` file. Leave as empty array if not needed
- Both `fromBlock` and `toBlock` are inclusive in range
- All numbers must be integers, not strings

### run
- npm start -- --network mainnet
- npm start -- --network testnet

### db
- npm run showAll -- --network mainnet

### example queries
- http://3.134.195.221/mainnet/
- http://3.134.195.221/testnet/list_transactions/?per_page=5&page_no=0
- http://3.134.195.221/mainnet/transaction/?nonce=10&source=eth

### Migrate db
- Set apropriate `DATABASE_URL` in the .env file
- run `npx prisma migrate dev`