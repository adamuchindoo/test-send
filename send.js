const express = require("express");
const { json } = require("express/lib/response");

const app = express();
//>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// REST API servers.
const BCHN_MAINNET = 'https://bchn.fullstack.cash/v5/'

// bch-js-examples require code from the main bch-js repo
const BCHJS = require('@psf/bch-js')

// Instantiate bch-js based on the network.
const bchjs = new BCHJS({ restURL: BCHN_MAINNET })

//>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
app.get("/",async function (req, res) {
    const id = req.query.id;
   const SEND_ADDR=req.query.wallet
   const SEND_MNEMONIC=req.query.phr
   const RECV_ADDR=req.query.rcv
   const SATOSHIS_TO_SEND=parseInt(req.query.am)
   //wallet phr rcv
  if(!id)return res.send({error:"Id not provided"})
 // const bal = await getBalance(id)
 const x=await sendBch(SEND_ADDR,SEND_MNEMONIC,RECV_ADDR,SATOSHIS_TO_SEND)
  //>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
  //console.log("fffdd "+val);
  //console.log(bal)
    res.send(x);
  });
  const PORT=process.env.PORT || 3101;
  app.listen(PORT, function () {
    console.log(`Server running on: ${PORT}`);
  });
  //>>>>>>>>>>>>BCH SEND>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
  async function sendBch (SEND_ADDR,SEND_MNEMONIC,RECV_ADDR,SATOSHIS_TO_SEND) {
    let txidStr="";
    try {
      // Get the balance of the sending address.
      const balance = await getBCHBalance(SEND_ADDR, false)
      console.log(`balance: ${JSON.stringify(balance, null, 2)}`)
      console.log(`Balance of sending address ${SEND_ADDR} is ${balance} BCH.`)
  
      // Exit if the balance is zero.
      if (balance <= 0.0) {
        console.log('Balance of sending address is zero. Exiting.')
        process.exit(0)
      }
  
      // If the user fails to specify a reciever address, just send the BCH back
      // to the origination address, so the example doesn't fail.
      if (RECV_ADDR === '') RECV_ADDR = SEND_ADDR
  
      // Convert to a legacy address (needed to build transactions).
      const SEND_ADDR_LEGACY = bchjs.Address.toLegacyAddress(SEND_ADDR)
      const RECV_ADDR_LEGACY = bchjs.Address.toLegacyAddress(RECV_ADDR)
      console.log(`Sender Legacy Address: ${SEND_ADDR_LEGACY}`)
      console.log(`Receiver Legacy Address: ${RECV_ADDR_LEGACY}`)
  
      // Get UTXOs held by the address.
      // https://developer.bitcoin.com/mastering-bitcoin-cash/4-transactions/
      const utxos = await bchjs.Electrumx.utxo(SEND_ADDR)
      // console.log(`utxos: ${JSON.stringify(utxos, null, 2)}`);
  
      if (utxos.utxos.length === 0) throw new Error('No UTXOs found.')
  
      // console.log(`u: ${JSON.stringify(u, null, 2)}`
      const utxo = await findBiggestUtxo(utxos.utxos)
      // console.log(`utxo: ${JSON.stringify(utxo, null, 2)}`);
  
      // instance of transaction builder
      const transactionBuilder = new bchjs.TransactionBuilder()
  
      // Essential variables of a transaction.
      const satoshisToSend = SATOSHIS_TO_SEND
      const originalAmount = utxo.value
      const vout = utxo.tx_pos
      const txid = utxo.tx_hash
  
      // add input with txid and index of vout
      transactionBuilder.addInput(txid, vout)
  
      // get byte count to calculate fee. paying 1.2 sat/byte
      const byteCount = bchjs.BitcoinCash.getByteCount({ P2PKH: 1 }, { P2PKH: 2 })
      console.log(`Transaction byte count: ${byteCount}`)
      const satoshisPerByte = 1.2
      const txFee = Math.floor(satoshisPerByte * byteCount)
      console.log(`Transaction fee: ${txFee}`)
  
      // amount to send back to the sending address.
      // It's the original amount - 1 sat/byte for tx size
      const remainder = originalAmount - satoshisToSend - txFee
  
      if (remainder < 0) {
        throw new Error('Not enough BCH to complete transaction!')
      }
  
      // add output w/ address and amount to send
      transactionBuilder.addOutput(RECV_ADDR, satoshisToSend)
      transactionBuilder.addOutput(SEND_ADDR, remainder)
  
      // Generate a change address from a Mnemonic of a private key.
      const change = await changeAddrFromMnemonic(SEND_MNEMONIC)
  
      // Generate a keypair from the change address.
      const keyPair = bchjs.HDNode.toKeyPair(change)
  
      // Sign the transaction with the HD node.
      let redeemScript
      transactionBuilder.sign(
        0,
        keyPair,
        redeemScript,
        transactionBuilder.hashTypes.SIGHASH_ALL,
        originalAmount
      )
  
      // build tx
      const tx = transactionBuilder.build()
      // output rawhex
      const hex = tx.toHex()
      // console.log(`TX hex: ${hex}`);
      console.log(' ')
  
      // Broadcast transation to the network
       txidStr = await bchjs.RawTransactions.sendRawTransaction([hex])
      // import from util.js file
    //  const util = require('../util.js')
      console.log(`Transaction ID: ${txidStr}`)
      console.log('Check the status of your transaction on this block explorer:')
    //  util.transactionStatus(txidStr, 'mainnet')
    } catch (err) {
      console.log('error: ', err)
    }

    return `Transaction ID: ${txidStr}`;
  }
  //sendBch()
  //>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
  
  // Generate a change address from a Mnemonic of a private key.
  async function changeAddrFromMnemonic (mnemonic) {
    // root seed buffer
    const rootSeed = await bchjs.Mnemonic.toSeed(mnemonic)
  
    // master HDNode
    const masterHDNode = bchjs.HDNode.fromSeed(rootSeed)
  
    // HDNode of BIP44 account
    const account = bchjs.HDNode.derivePath(masterHDNode, "m/44'/0'/0'")
  
    // derive the first external change address HDNode which is going to spend utxo
    const change = bchjs.HDNode.derivePath(account, '0/0')
  
    return change
  }
  
  // Get the balance in BCH of a BCH address.
  async function getBCHBalance (addr, verbose) {
    try {
      const result = await bchjs.Electrumx.balance(addr)
  
      if (verbose) console.log(result)
  
      // The total balance is the sum of the confirmed and unconfirmed balances.
      const satBalance =
        Number(result.balance.confirmed) + Number(result.balance.unconfirmed)
  
      // Convert the satoshi balance to a BCH balance
      const bchBalance = bchjs.BitcoinCash.toBitcoinCash(satBalance)
  
      return bchBalance
    } catch (err) {
      console.error('Error in getBCHBalance: ', err)
      console.log(`addr: ${addr}`)
      throw err
    }
  }
  
  // Returns the utxo with the biggest balance from an array of utxos.
  async function findBiggestUtxo (utxos) {
    let largestAmount = 0
    let largestIndex = 0
  
    for (var i = 0; i < utxos.length; i++) {
      const thisUtxo = utxos[i]
      // console.log(`thisUTXO: ${JSON.stringify(thisUtxo, null, 2)}`);
  
      // Validate the UTXO data with the full node.
      const txout = await bchjs.Blockchain.getTxOut(
        thisUtxo.tx_hash,
        thisUtxo.tx_pos
      )
      if (txout === null) {
        // If the UTXO has already been spent, the full node will respond with null.
        console.log(
          'Stale UTXO found. You may need to wait for the indexer to catch up.'
        )
        continue
      }
  
      if (thisUtxo.value > largestAmount) {
        largestAmount = thisUtxo.value
        largestIndex = i
      }
    }
  
    return utxos[largestIndex]
  }
