/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['connectkit'],
  webpack: (config) => {
    // Stub out Node/React-Native-only modules pulled in transitively by
    // wagmi / WalletConnect / MetaMask SDK that are not used in the browser.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      'pino-pretty':  false,
      'encoding':     false,
      'lokijs':       false,
      '@react-native-async-storage/async-storage': false,
    }
    return config
  },
}
export default nextConfig
