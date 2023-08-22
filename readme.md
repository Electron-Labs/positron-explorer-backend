### Positron Explorer Backend

### run
- npm start -- --network mainnet
- npm start -- --network testnet

### db
- npm run showAll -- --network mainnet
- npm run deleteAll --network testnet


### example queries
- http://3.134.195.221/mainnet/
- http://3.134.195.221/testnet/list_transactions/?per_page=5&page_no=0

### port forwarding
- ssh -L 8080:localhost:5001 ubuntu@3.17.61.72
- http://localhost:8080/list_transactions/0/3