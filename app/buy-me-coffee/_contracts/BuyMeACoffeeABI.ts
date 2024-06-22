/**
 * This ABI is trimmed down to just the functions we expect to call for the
 * sake of minimizing bytes downloaded.
 */
const abi = [
	{ type: 'constructor', inputs: [], stateMutability: 'nonpayable' },
	{ type: 'receive', stateMutability: 'payable' },
	{
	  type: 'function',
	  name: 'buyCoffee',
	  inputs: [
		{ name: 'numCoffees', type: 'uint256', internalType: 'uint256' },
		{ name: 'userName', type: 'string', internalType: 'string' },
		{ name: 'twitterHandle', type: 'string', internalType: 'string' },
		{ name: 'message', type: 'string', internalType: 'string' },
	  ],
	  outputs: [],
	  stateMutability: 'payable',
	},
	{
	  type: 'function',
	  name: 'getMemos',
	  inputs: [
		{ name: 'index', type: 'uint256', internalType: 'uint256' },
		{ name: 'size', type: 'uint256', internalType: 'uint256' },
	  ],
	  outputs: [
		{
		  name: '',
		  type: 'tuple[]',
		  internalType: 'struct Memo[]',
		  components: [
			{ name: 'numCoffees', type: 'uint256', internalType: 'uint256' },
			{ name: 'userName', type: 'string', internalType: 'string' },
			{ name: 'twitterHandle', type: 'string', internalType: 'string' },
			{ name: 'message', type: 'string', internalType: 'string' },
			{ name: 'time', type: 'uint256', internalType: 'uint256' },
			{ name: 'userAddress', type: 'address', internalType: 'address' },
		  ],
		},
	  ],
	  stateMutability: 'view',
	},
	{
	  type: 'function',
	  name: 'memos',
	  inputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
	  outputs: [
		{ name: 'numCoffees', type: 'uint256', internalType: 'uint256' },
		{ name: 'userName', type: 'string', internalType: 'string' },
		{ name: 'twitterHandle', type: 'string', internalType: 'string' },
		{ name: 'message', type: 'string', internalType: 'string' },
		{ name: 'time', type: 'uint256', internalType: 'uint256' },
		{ name: 'userAddress', type: 'address', internalType: 'address' },
	  ],
	  stateMutability: 'view',
	},
	// ... rest of the ABI unchanged
  ] as const;

export default abi;
