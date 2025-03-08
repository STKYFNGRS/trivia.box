// ENS avatar utilities
// Import commented out as it might not be installed
// import { normalize } from 'viem/ens';

// Basic function to generate a default avatar
export const generateDefaultAvatar = (address: string): string => {
  // This could be enhanced to generate unique identicon-like avatars
  return '';
};

// Function to directly get the ENS avatar URL for a given ENS name
export const getDirectEnsAvatar = async (ensName: string): Promise<string | null> => {
  try {
    console.log('Attempting direct ENS avatar fetch for', ensName);
    
    // For now, we'll use a third-party API to get avatar information
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout
    
    try {
      const response = await fetch(`https://metadata.ens.domains/mainnet/avatar/${ensName}`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        // The API returns the avatar image directly
        const avatarUrl = response.url;
        console.log('Successfully fetched ENS avatar for', ensName, ':', avatarUrl);
        return avatarUrl;
      } else {
        console.warn(`ENS avatar API returned status ${response.status} for ${ensName}`);
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if ((fetchError as Error).name === 'AbortError') {
        console.warn(`ENS avatar fetch timed out for ${ensName}`);
      } else {
        console.warn(`ENS avatar fetch failed for ${ensName}:`, fetchError);
      }
    }
    
    return null;
  } catch (error) {
    console.warn(`Failed to fetch ENS avatar for ${ensName}:`, error);
    return null;
  }
};

// Enhanced function to fetch ENS profile details from the blockchain
export interface ENSProfileData {
  description?: string | null;
  url?: string | null;
  twitter?: string | null;
  github?: string | null;
  discord?: string | null;
  email?: string | null;
  // Any other social links or profile details
}

export async function fetchENSProfile(ensName: string): Promise<ENSProfileData | null> {
  try {
    // In production, you would:
    // 1. Create a connection to the Ethereum network
    // 2. Look up the resolver for the ENS name
    // 3. Query the resolver for all the relevant text records
    
    // Example code for production (using ethers.js):
    /*
    const provider = new ethers.providers.JsonRpcProvider("https://mainnet.infura.io/v3/YOUR_INFURA_KEY");
    const resolver = await provider.getResolver(ensName);
    
    if (!resolver) return null;
    
    // Fetch all the standard text records in parallel
    const [description, url, twitter, github, discord, email] = await Promise.all([
      resolver.getText("description").catch(() => null),
      resolver.getText("url").catch(() => null),
      resolver.getText("com.twitter").catch(() => null),
      resolver.getText("com.github").catch(() => null),
      resolver.getText("com.discord").catch(() => null),
      resolver.getText("email").catch(() => null)
    ]);
    
    return {
      description,
      url,
      twitter,
      github,
      discord,
      email
    };
    */
    
    // For development purposes, we'll use the ENS Metadata Service API
    // This should be replaced with direct blockchain calls in production
    try {
      const response = await fetch(`https://metadata.ens.domains/mainnet/name/${ensName}`);
      
      if (response.ok) {
        const data = await response.json();
        const textRecords = data.records || {};
        
        return {
          description: textRecords.description || null,
          url: textRecords.url || null,
          twitter: textRecords['com.twitter'] || null,
          github: textRecords['com.github'] || null,
          discord: textRecords['com.discord'] || null,
          email: textRecords.email || null
        };
      }
    } catch (apiError) {
      console.warn(`ENS Metadata Service error for ${ensName}:`, apiError);
    }
    
    return null;
  } catch (error) {
    console.warn(`Failed to fetch ENS profile for ${ensName}:`, error);
    return null;
  }
}

// Helper for fetching all ENS text records for a name
export async function fetchENSTextRecords(ensName: string): Promise<Record<string, string> | null> {
  try {
    // This would be implemented using ethers.js or viem in production
    // to query the ENS resolver for all text records
    
    // For development, we'll use the ENS Metadata Service
    const response = await fetch(`https://metadata.ens.domains/mainnet/name/${ensName}`);
    
    if (response.ok) {
      const data = await response.json();
      return data.records || {};
    }
    
    return null;
  } catch (error) {
    console.warn(`Failed to fetch ENS text records for ${ensName}:`, error);
    return null;
  }
}
