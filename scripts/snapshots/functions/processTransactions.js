import getCounterPartyName from "./getCounterPartyName.js";

const processTransactions = async (snapshotAccount, transactions, makerProtocolAddresses, knex) => {

    console.log(`Fetched ${transactions.length} transactions for ${snapshotAccount.accountAddress}`);
    let protocolTransactions = [];
    let addedTransactionsCount = 0;

    for (let i = 0; i < transactions.length; i++) {

        const txData = transactions[i];
        const account = txData.flow === 'outflow' ? txData.sender : txData.receiver;

        if (account === snapshotAccount.accountAddress) {

            const counterParty = txData.flow === 'inflow' ? txData.sender : txData.receiver;
            const counterPartyName = getCounterPartyName(counterParty);
            const amount = txData.flow === 'inflow' ? txData.amount : -txData.amount;

            await knex('SnapshotAccountTransaction').insert({
                block: txData.block,
                timestamp: txData.timestamp,
                txHash: txData.tx_hash,
                token: txData.token,
                counterParty: counterParty,
                counterPartyName: counterPartyName,
                amount: amount,
                snapshotAccountId: snapshotAccount.id,
            });

            addedTransactionsCount++;


            //Check MakerProtocol addressses
            if (makerProtocolAddresses.indexOf(counterParty.toLowerCase()) > -1) {
                protocolTransactions.push(txData);
            }
        }
    }
    return {
        addedTransactions: addedTransactionsCount,
        protocolTransactions: protocolTransactions
    };
};



export default processTransactions;