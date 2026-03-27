import XCTest
@testable import StellarTxIOS

final class StellarTxIOSTests: XCTestCase {
    func testBlueprintStructExists() {
        let tb = TxTimebounds(minTime: 0, maxTime: 10)
        let bp = TxBlueprint(
            sourceAccount: "GTEST",
            destination: "GDEST",
            amount: "1.0",
            asset: "XLM",
            networkPassphrase: "Test SDF Network ; September 2015",
            memoBase64: nil,
            timebounds: tb
        )
        XCTAssertEqual(bp.sourceAccount, "GTEST")
        XCTAssertEqual(bp.destination, "GDEST")
    }
}

