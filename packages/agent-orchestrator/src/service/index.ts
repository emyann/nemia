/**
 * The face of `service/`: the service a person installs, as its unit or plist reads (`unitRead`, `plistRead`), where it lives and its
 * name (`unitName`, `unitPathOf`, `DEFAULT_NAME`), the system it runs under (`systemOf`), the keys it owns (`OWN_KEYS`), who holds the
 * store's lease (`holderOfLease`, `takeOverLine`), the size of a machine's daemon (`sizedFor`), and the kind of a bind's address and
 * whether it is listened on unasked (`addressParsed`, `addressKind`, `kindOfBind`, `bindExposure`, `BIND_PUBLIC_VARIABLE`), with this
 * machine's addresses (`machineAddresses`).
 */
export {
  DEFAULT_NAME,
  holderOfLease,
  OWN_KEYS,
  plistRead,
  systemOf,
  takeOverLine,
  unitName,
  unitPathOf,
  unitRead,
  type ServiceSystem,
} from './service.ts';
export { sizedFor } from './sizing.ts';
export {
  addressKind,
  addressParsed,
  BIND_PUBLIC_VARIABLE,
  bindExposure,
  kindOfBind,
  machineAddresses,
  type Exposure,
  type MachineAddress,
  type Parsed,
} from './address.ts';
