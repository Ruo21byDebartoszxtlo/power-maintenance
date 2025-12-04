// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32 } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract FHEPowerMaintenance is SepoliaConfig {

    struct EncryptedSensorData {
        uint256 id;
        euint32 encryptedTemperature;
        euint32 encryptedVibration;
        uint256 timestamp;
    }

    struct MaintenancePrediction {
        string equipmentId;
        uint256 predictedRUL;
        bool isProcessed;
    }

    uint256 public dataCount;
    mapping(uint256 => EncryptedSensorData) public encryptedData;
    mapping(uint256 => MaintenancePrediction) public predictions;

    mapping(string => euint32) private encryptedEquipmentCount;
    string[] private equipmentList;

    mapping(uint256 => uint256) private requestToDataId;

    event DataSubmitted(uint256 indexed id, uint256 timestamp);
    event PredictionRequested(uint256 indexed id);
    event PredictionProcessed(uint256 indexed id);

    modifier onlyOperator(uint256 dataId) {
        // Placeholder for access control
        _;
    }

    function submitEncryptedSensorData(
        euint32 encryptedTemperature,
        euint32 encryptedVibration
    ) public {
        dataCount += 1;
        uint256 newId = dataCount;

        encryptedData[newId] = EncryptedSensorData({
            id: newId,
            encryptedTemperature: encryptedTemperature,
            encryptedVibration: encryptedVibration,
            timestamp: block.timestamp
        });

        predictions[newId] = MaintenancePrediction({
            equipmentId: "",
            predictedRUL: 0,
            isProcessed: false
        });

        emit DataSubmitted(newId, block.timestamp);
    }

    function requestPrediction(uint256 dataId) public onlyOperator(dataId) {
        EncryptedSensorData storage data = encryptedData[dataId];
        require(!predictions[dataId].isProcessed, "Already processed");

        bytes32[] memory ciphertexts = new bytes32[](2);
        ciphertexts[0] = FHE.toBytes32(data.encryptedTemperature);
        ciphertexts[1] = FHE.toBytes32(data.encryptedVibration);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.processPrediction.selector);
        requestToDataId[reqId] = dataId;

        emit PredictionRequested(dataId);
    }

    function processPrediction(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 dataId = requestToDataId[requestId];
        require(dataId != 0, "Invalid request");

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint256[] memory results = abi.decode(cleartexts, (uint256[]));

        MaintenancePrediction storage pred = predictions[dataId];
        pred.equipmentId = string(abi.encodePacked("EQ-", uint2str(dataId)));
        pred.predictedRUL = results[0];
        pred.isProcessed = true;

        if (FHE.isInitialized(encryptedEquipmentCount[pred.equipmentId]) == false) {
            encryptedEquipmentCount[pred.equipmentId] = FHE.asEuint32(0);
            equipmentList.push(pred.equipmentId);
        }
        encryptedEquipmentCount[pred.equipmentId] = FHE.add(
            encryptedEquipmentCount[pred.equipmentId],
            FHE.asEuint32(1)
        );

        emit PredictionProcessed(dataId);
    }

    function getPrediction(uint256 dataId) public view returns (
        string memory equipmentId,
        uint256 predictedRUL,
        bool isProcessed
    ) {
        MaintenancePrediction storage p = predictions[dataId];
        return (p.equipmentId, p.predictedRUL, p.isProcessed);
    }

    function getEncryptedEquipmentCount(string memory equipmentId) public view returns (euint32) {
        return encryptedEquipmentCount[equipmentId];
    }

    function requestEquipmentCountDecryption(string memory equipmentId) public {
        euint32 count = encryptedEquipmentCount[equipmentId];
        require(FHE.isInitialized(count), "Equipment not found");

        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(count);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptEquipmentCount.selector);
        requestToDataId[reqId] = bytes32ToUint(keccak256(abi.encodePacked(equipmentId)));
    }

    function decryptEquipmentCount(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 equipmentHash = requestToDataId[requestId];
        string memory equipmentId = getEquipmentFromHash(equipmentHash);

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32 count = abi.decode(cleartexts, (uint32));
        // Decrypted count can be stored or emitted
    }

    function bytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }

    function getEquipmentFromHash(uint256 hash) private view returns (string memory) {
        for (uint i = 0; i < equipmentList.length; i++) {
            if (bytes32ToUint(keccak256(abi.encodePacked(equipmentList[i]))) == hash) {
                return equipmentList[i];
            }
        }
        revert("Equipment not found");
    }

    function uint2str(uint256 _i) internal pure returns (string memory str) {
        if (_i == 0) {
            return "0";
        }
        uint256 j = _i;
        uint256 length;
        while (j != 0) {
            length++;
            j /= 10;
        }
        bytes memory bstr = new bytes(length);
        uint256 k = length;
        j = _i;
        while (j != 0) {
            bstr[--k] = bytes1(uint8(48 + j % 10));
            j /= 10;
        }
        str = string(bstr);
    }
}