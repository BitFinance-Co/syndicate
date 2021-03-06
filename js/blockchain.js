/*
Written with web3.js 1.x library
Note: Asynchronous JS functions are required in web3.js 1.x
 */

/*
Onload event listener: asks permission to access accounts (metamask)
and starts app by calling startdApp()
*/
window.addEventListener("load", async () => {
  // Modern dapp browsers...
  if (window.ethereum) {
    window.web3 = new Web3(ethereum);
    try {
      // Request account access if needed
      await ethereum.enable();

      console.log("Account unlocked");
      const myAccounts = await web3.eth.getAccounts();
      userAccount = myAccounts[0];
    } catch (error) {
      console.log("Access denied");
      console.log(error);
      $("#errMsg").html("You need to connect metamask to use this Application");
    }
  }
  // Legacy dapp browsers...
  else if (window.web3) {
    window.web3 = new Web3(web3.currentProvider);
    // Acccounts always exposed
  }
  // For non-dapp browsers...
  else {
    console.log(
      "Non-Ethereum browser detected. You should consider trying MetaMask!"
    );
    $("#errMsg").html(
      "<b>Non-Ethereum browser detected.</b> You should consider trying MetaMask!"
    );
  }
  // Consider storing all logic in this wrapper function
  startdApp();
}); // End enable window

function startdApp() {
  console.log("startdApp() called, web3 interface running");
  printNetwork();
  printAddress(userAccount);

  storeContract = new web3.eth.Contract(storeABI, storeAddress);
  logLoans();
  loadTxHistory();
}

function isJson(str) {
  // console.log('checking if JSON')
  try {
    JSON.parse(str);
    // console.log(str);
  } catch (e) {
    // console.log('No JSON')
    return false;
  }
  // console.log('is a valid JSON, returning true');
  return true;
}

/*
Function called on clicking button "Retrieve Loans from Smart Contract"
Loads loans from blockchain and writes them as objects into browser storage
*/
async function logLoans() {
  $.LoadingOverlay("show", {
    background: "rgba(40, 40, 40, 0.7)"
  });
  // // Call function to get the length of the loan-array and pass it to for-loop
  const loanArrLength = await getArrLength();
  //console.log(`Found ${loanArrLength} loans in Smart Contract`);

  const loanIdsByUser = await getLoansByUser(userAccount);
  //console.log(`Loans of this user: ${loanIdsByUser}`);
  //console.log(loanIdsByUser.length);
  if (loanIdsByUser.length == 0) alert("You did not yet create any loans");

  // Declare key for sessionStorage
  var bc_key;

  // Looping through each loan-item of array
  for (i = 0; i < loanIdsByUser.length; i++) {
    // if (devMode) console.log('Logging loans from Blockchain \n: for-loop:'+ i +' loanIdsByUser[i] '+ loanIdsByUser[i]);
    // loading the loan object from Blockchain
    const loan = await retrieveLoan(loanIdsByUser[i]);

    // console.log(loan);
    // Check in place, in case the loan was deleted
    if (loan.registeringParty.includes("0x000000000000")) {
      //console.log(`Loan ${i} was deleted`);
      continue;
    }
    const approvalArray = await getApprovalStatus(loanIdsByUser[i]);
    // console.log(approvalArray);

    const amountsArray = await getLoanAmounts(loanIdsByUser[i]);
    // console.log(amountsArray);

    // a check based on comparing userAccount (address) with array could achieve the same
    const userId = await getUserToId(loanIdsByUser[i], userAccount);
    // console.log(`User ID in this loan: ${userId}`);

    const usersInLoanArray = (await getUsersInLoan(loanIdsByUser[i]))[0];
    // console.log(usersInLoanArray);

    // Set key to store loan in sessionStorage
    bc_key = "bc_" + loan.id;

    // Retrieves all keys from the key-value browser storage (e.g. id_1)
    sessionKeys = Object.keys(sessionStorage);

    // // Check if key (object) already exists, if so, delete
    // if (sessionKeys.includes(bc_key)) {
    //     sessionStorage.removeItem(bc_key);
    // }

    var dataStringObj = {};

    if (loan.dataString && isJson(loan.dataString)) {
      dataStringObj = JSON.parse(loan.dataString); // Store parsed, so object key-value pairs can be read
      // console.log(dataStringObj);
    }

    if (!sessionKeys.includes(bc_key)) {
      // Create new object (with less key-val pairs) based on loan object retrieved from Smart Contract
      var bc_loan = {
        id: loan.id,
        name: loan.name,
        revisionNumber: loan.revisionNumber,
        registeringParty: loan.registeringParty,
        dataString: loan.dataString, // As stored in 'string dataString'
        dataStringObj: dataStringObj,
        date: loan.regTime,
        state: "review", // Not yet in struct
        loanAmounts: amountsArray,
        approvalStatus: approvalArray,
        addresses: usersInLoanArray,
        userId: userId
      };

      //console.log('Storing loan under key: '+ bc_key);

      //  Saves object in browser storage (different data structure than locally created loans, [0]: name etc.)
      sessionStorage.setItem(bc_key, JSON.stringify(bc_loan));

      addLoanToSidePanel(loan.id, loan.name, loan.regTime, "bc");
    }
  }

  $.LoadingOverlay("hide");

  // Refresh Current User List (when at top of function, stops for-loop after first iteration)
  retrieveUsers();
  // Trigger to click and load the last added loan in the side menu

  setTimeout(function() {
    $(`li[data-storage-key="${bc_key}"]`).trigger("click");
  }, 1000);
}

async function updateLoanOnChain() {
  // Updates Loan in Browser-Storage according to current form values
  updateLoanInBrowser();

  // Load active loan from JSON in Storage
  activeLoan = returnActiveLoan();
//   console.log(activeLoan);

  // Load loan from blockchain (Necessary, only to check if differences exist)
  //console.log('Loading loan from blockchain (id/key): ' + activeLoanId);
  const loanBc = await retrieveLoan(activeLoan.id)
  ;

  // Check if form fields have really been updated (implementation difficult, and probaly unnecessary)
  // Check if loan amount has changed
  if (
    loanBc.name != activeLoan.name ||
    loanBc.dataString != activeLoan.dataString
  ) {
    //console.log("Active loan has been changed");
    _name = activeLoan.name;
    _dataString = activeLoan.dataString;
    _loanAmount = activeLoan.loanAmounts[activeLoan.userId];
    //console.log(_dataString);
  } else {
    alert("Active loan has not been changed");
    return;
  }

  // Make sure important values are specified
  if (!_name || !_dataString) {
    alert("Some value have not been specified, aborting...");
    return;
  }

  //console.log('Info: Calling updateLoan() on Smart Contract: ');
  txNotifyUI("send", "update");
  // Execute function on EVM:
  storeContract.methods
    .updateLoan(activeLoan.id, _name, _dataString, _loanAmount)
    .send({ from: userAccount })
    .on("receipt", function(receipt) {
      txNotifyUI("conf", "update", activeLoanId);
      //console.log(receipt);

      // Delete locally stored loan from SessionStorage and retrieve from BC
      sessionStorage.removeItem(activeLoanId);
      deleteFromSidePanel(activeLoanId);
      logLoans();
    })
    .on("error", function(error) {
      // Do something to alert the user their transaction has failed
      $("tx-status").text(error);
    });
}

// Function to create loan on smart contract and write it to the blockchain
// Function: Logic (+some UI)
async function writeLoan() {
  // Updates Loan in Browser-Storage
  updateLoanInBrowser();

  // Load active loan from JSON in Storage
  activeLoan = returnActiveLoan();
  //console.log(activeLoan);

  _name = activeLoan.name;
  _dataString = activeLoan.dataString;

  // When first writing loan, make sure these values are non-zero
  if (!_name || !_dataString) {
    alert("Some value have not been specified, aborting...");
    return;
  }

  try {
    //console.log("Info: Writing Loan with id: " + activeLoanId);
    //console.log("Info: Calling createLoan() on Smart Contract: ");

    txNotifyUI("send", "create");
    // Execute function on EVM:
    storeContract.methods
      .createLoan(_name, _dataString)
      .send({ from: userAccount })
      .on("receipt", function(receipt) {
        txNotifyUI("conf", "create", activeLoanId);
        //console.log(receipt);
        // Delete locally stored loan from SessionStorage and retrieve from BC
        sessionStorage.removeItem(activeLoanId);
        deleteFromSidePanel(activeLoanId);
        logLoans();
      })
      .on("error", function(error) {
        // Do something to alert the user their transaction has failed
        $("tx-status").text(error);
      });
  } catch (err) {
    console.log(err);
  }
}

// Function to approve current (activeLoanId) Loan
async function approveLoan() {
  if (devMode) alert("ApproveLoan() called");

  // Load active loan object from browser storage
  activeLoan = returnActiveLoan();

  txNotifyUI("send", "approve");
  // Execute function on EVM:
  storeContract.methods
    .approveLoan(activeLoan.id, activeLoan.revisionNumber)
    .send({ from: userAccount })
    .on("receipt", function(receipt) {
      txNotifyUI("conf", "approve", activeLoanId);
      //console.log(receipt);

      // Delete locally stored loan from SessionStorage and retrieve from BC
      sessionStorage.removeItem(activeLoanId);
      deleteFromSidePanel(activeLoanId);
      logLoans();
    })
    .on("error", function(error) {
      // Do something to alert the user their transaction has failed
      $("tx-status").text(error);
    });
}
