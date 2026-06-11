// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MeridianRegistry} from "../src/MeridianRegistry.sol";

contract DeployRegistry is Script {
    function run() external {
        address vault      = 0x2a339711221B33f9e5Ccd2e3811D3d00Eba020A7;
        address identity   = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
        address reputation = 0x8004B663056A597Dffe9eCcC1965A193B7388713;
        address keeper     = 0x640CF727cDd96357d7f7B05A46cAb517012A7911;

        vm.startBroadcast();
        MeridianRegistry registry = new MeridianRegistry(vault, identity, reputation, keeper);
        console.log("MeridianRegistry:", address(registry));
        vm.stopBroadcast();
    }
}
