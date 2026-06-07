.PHONY: build test deploy-sepolia clean

CONTRACTS := packages/contracts

build:
	cd $(CONTRACTS) && forge build

test:
	cd $(CONTRACTS) && forge test -v

test-gas:
	cd $(CONTRACTS) && forge test --gas-report

coverage:
	cd $(CONTRACTS) && forge coverage

deploy-sepolia:
	cd $(CONTRACTS) && forge script script/Deploy.s.sol \
		--rpc-url $$MANTLE_SEPOLIA_RPC \
		--private-key $$DEPLOYER_PRIVATE_KEY \
		--broadcast \
		--chain-id 5003

clean:
	cd $(CONTRACTS) && forge clean

fmt:
	cd $(CONTRACTS) && forge fmt
