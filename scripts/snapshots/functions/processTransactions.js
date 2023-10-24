import getAccountInfoFromConfig from "./getAccountInfoFromConfig.js";

const aliases = {
    // Maker Protocol primary account
    '0xbe8e3e3618f7474f8cb1d074a26affef007e98fb': [
        // Addresses treated as Maker Protocol aliases 
        '0x0048fc4357db3c0f45adea433a07a20769ddb0cf',
        '0x0000000000000000000000000000000000000000',
    ]
};

const processTransactions = async (snapshotAccount, transactions, monthInfo, invertFlows, knex) => {
    const protocolTransactions = [];
    const paymentProcessorTransactions = [];
    const initialBalanceByToken = {};
    const finalBalanceByToken = {};
    const timespan = { start: null, end: null };
    const invertedFlow = { inflow: 'outflow', outflow: 'inflow' };
    let addedTransactionsCount = 0;
    
    console.log(`\nProcessing ${transactions.length} initial transactions for account ${snapshotAccount.id}: ${snapshotAccount.accountLabel} (${snapshotAccount.accountAddress})`);
    console.log(` ...inverted flows: ${invertFlows ? 'YES' : 'no'}`);
    console.log(` ...block range [${monthInfo.blockNumberRange.initial}-${monthInfo.blockNumberRange.final}] for month:${monthInfo.month}`)
    
    const transactionsStack = [...transactions];
    transactionsStack.sort((t1, t2) => (t2.datetime < t1.datetime ? -1 : 1));

    let txData = null;
    if (snapshotAccount.offChain) {
        addOffChainTransactionsToStack(transactionsStack, txData, finalBalanceByToken, monthInfo.offChainBalances);
    }
    
    while (txData = transactionsStack.pop()) {
        if(txData.amount > 0){
            txData.flow = 'inflow';
        }
        else {
            txData.flow = 'outflow';
        }
        const relativeTxData = applyFlow(txData, (invertFlows ? invertedFlow[txData.flow] : txData.flow));

        // Skip irrelevant transactions that belong to the counterparty wallet
        if (snapshotAccount.accountAddress !== relativeTxData.accountAddress) {
            if (!aliases[snapshotAccount.accountAddress] || 
                aliases[snapshotAccount.accountAddress].indexOf(relativeTxData.accountAddress) < 0
            ) {
                continue;
            } else {
                console.log(` ...keeping transaction of ${relativeTxData.accountAddress} because it's a known alias of ${snapshotAccount.accountLabel}`);
            }
        }

        // Ensure that the balances is properly initialized
        if (!finalBalanceByToken[txData.token]){
            finalBalanceByToken[txData.token] = 0;
            initialBalanceByToken[txData.token] = 0;
        }
        
        // A block range is set and we haven't reached the first block yet 
        //   => don't include the transaction yet, but increase the balances
        if (monthInfo.blockNumberRange.initial && txData.block < monthInfo.blockNumberRange.initial) {
            finalBalanceByToken[txData.token] += relativeTxData.amount;
            initialBalanceByToken[txData.token] += relativeTxData.amount;

        // No block range is set or we haven't hit the final block of the set range yet
        //   => include the transaction
        } else if (
            (monthInfo.blockNumberRange.final && txData.block < monthInfo.blockNumberRange.final)
            || !monthInfo.blockNumberRange.final
        ) {
            // Only add towards the final balance
            finalBalanceByToken[txData.token] += relativeTxData.amount;

            // Add the transaction to the selected account in the database
            await knex('SnapshotAccountTransaction').insert({
                snapshotAccountId: snapshotAccount.id,
                block: txData.block,
                timestamp: txData.datetime,
                txHash: txData.tx_hash,
                token: txData.token,
                counterParty: relativeTxData.counterPartyAddress,
                counterPartyName: relativeTxData.counterPartyInfo.name,
                amount: relativeTxData.amount,
            });

            addedTransactionsCount++;

            // Keep track of the earliest and oldest datetime
            if (!timespan.start || txData.datetime < timespan.start) {
                timespan.start = txData.datetime;
            }

            if (!timespan.end || txData.datetime > timespan.end) {
                timespan.end = txData.datetime;
            }
        }

        // Keep track of included payment processor transactions
        if (relativeTxData.counterPartyInfo.offChain) {
            paymentProcessorTransactions.push(txData);
        }
        
        // Keep track of included Maker Protocol transactions
        if (relativeTxData.counterPartyInfo.isProtocolAddress) {
            protocolTransactions.push(txData);
        }

        // If it's the end of the month, put a synthetic transaction on the stack to reconcile the 
        // off-chain account with its balance.  
        if (snapshotAccount.offChain) {
            addOffChainTransactionsToStack(transactionsStack, txData, finalBalanceByToken, monthInfo.offChainBalances);
        }

        if (addedTransactionsCount > 9999) {
            throw new Error('EXIT LOOP');
        }
    }

    console.log(` ...added ${addedTransactionsCount} transaction(s)`);
    console.log(` ...detected ${protocolTransactions.length} transaction(s) with Protocol as counterparty`);
    console.log(` ...detected ${paymentProcessorTransactions.length} with Payment Processor as counterparty`);
    console.log(` ...calculated initial balance(s)`, initialBalanceByToken);
    console.log(` ...calculated final balance(s)`, finalBalanceByToken);
    console.log(` ...calculated timespan: ${timespan.start} => ${timespan.end}`);

    return {
        addedTransactions: addedTransactionsCount,
        protocolTransactions,
        paymentProcessorTransactions,
        initialBalanceByToken,
        finalBalanceByToken,
        timespan
    };
};

const applyFlow = (txData, flow) => {
    let result = null;

    if (flow === 'outflow') {
        result = {
            accountAddress: txData.sender,
            counterPartyAddress: txData.receiver,
            amount: -txData.amount,
            counterPartyInfo: getAccountInfoFromConfig(txData.receiver)
        };

    } else {
        result = {
            accountAddress: txData.receiver,
            counterPartyAddress: txData.sender,
            amount: txData.amount,
            counterPartyInfo: getAccountInfoFromConfig(txData.sender)
        };
    }

    return result;
};

const addOffChainTransactionsToStack = (transactionsStack, processedTransaction, calculatedBalanceByToken, offChainBalances) => {
    const
        currentTxMonth = processedTransaction ? processedTransaction.datetime.slice(0, 7).replace('-', '/') : '0000/00', 
        nextTransaction = (transactionsStack.length > 0 ? transactionsStack[transactionsStack.length-1] : null),
        nextTxMonth = nextTransaction ? nextTransaction.datetime.slice(0, 7).replace('-', '/') : '9999/99';

    const originalTransactionCount = transactionsStack.length;
    let transactionAdded = false;

    if (currentTxMonth !== nextTxMonth) {
        Object.keys(offChainBalances || {}).forEach(month => {
            if (!transactionAdded && currentTxMonth <= month && nextTxMonth > month) {
                const calculatedBalance = calculatedBalanceByToken.DAI || 0;
                const expectedBalance = offChainBalances[month].filter(b => b.token == 'USD')[0].newBalance;
                
                const syntheticTransaction = {
                    block: processedTransaction ? processedTransaction.block : null,
                    datetime: (new Date(month.slice(0, 4), month.slice(5, 7), 0, 23, 59, 59)).toISOString(),
                    tx_hash: null,
                    token: 'DAI',
                    label: 'Off-chain Payment(s)',
                    code: 'EXT',
                    type: 'payment-processor',
                    balance: expectedBalance,
                    flow: 'outflow',
                    // Needs the reverted flow logic
                    sender: '0xUNKNOWN',
                    receiver: '0x3c267dfc8ba8f7359af0d8afc45b43731173236d', 
                    amount: expectedBalance - calculatedBalance,
                }

                transactionsStack.push(syntheticTransaction);
                delete offChainBalances[month];
                console.log(` ...correcting off-chain balance with synthetic transaction (calculated: ${calculatedBalance} DAI; expected: ${expectedBalance} DAI):`, syntheticTransaction);
                console.log(` ...${transactionsStack.length} more transaction(s) to be processed (previously: ${originalTransactionCount})`);

                transactionAdded = true;
            }

            // Refrain from adding future balance corrections after 1
            // TODO: properly check which future corrections should be included for the given month/block range
            if (transactionAdded && nextTxMonth === '9999/99' && offChainBalances[month]) {
                delete offChainBalances[month];
            }
        });
    }
}

export default processTransactions;