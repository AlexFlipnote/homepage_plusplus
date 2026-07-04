export const isFirefox = typeof InstallTrigger !== "undefined"
export const isExtension = /^(?:chrome|moz)-extension:$/.test(location.protocol)

export function getVersion() {
  const browserAPI = typeof browser !== "undefined" ? browser : chrome
  return browserAPI.runtime.getManifest().version
}
