import type Cartridge from "../../model/cartridge.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";

export type Mapper34BoardKind = "bnrom" | "nina-001";

/** Immutable board identity for the two unrelated hardware families assigned mapper 34. */
export class Mapper34Board {
  private constructor(readonly kind: Mapper34BoardKind) {
    Object.freeze(this);
  }

  static resolve(cartridge: Cartridge): Mapper34Board {
    const kind = Mapper34Board.resolveKind(cartridge);
    if (kind === "nina-001") Mapper34Board.validateNina001(cartridge);
    else Mapper34Board.validateBnrom(cartridge);
    return new Mapper34Board(kind);
  }

  private static resolveKind(cartridge: Cartridge): Mapper34BoardKind {
    switch (cartridge.submapperNumber) {
      case 0:
        return cartridge.chrRom.byteLength > 0x2000 ? "nina-001" : "bnrom";
      case 1:
        return "nina-001";
      case 2:
        return "bnrom";
      default:
        throw new UnsupportedMapperVariantError(cartridge.mapperNumber, cartridge.submapperNumber);
    }
  }

  private static validateNina001(cartridge: Cartridge): void {
    if (![0x10_000, 0x20_000].includes(cartridge.prgRom.byteLength)) {
      throw Mapper34Board.configurationError(
        cartridge,
        "NINA-001 requires 64 or 128 KiB of PRG ROM",
      );
    }
    if (
      cartridge.hasWritableChrMemory ||
      ![0x2000, 0x4000, 0x8000, 0x10_000].includes(cartridge.chrRom.byteLength)
    ) {
      throw Mapper34Board.configurationError(
        cartridge,
        "NINA-001 requires 8, 16, 32 or 64 KiB of CHR ROM",
      );
    }
    if (cartridge.prgWritableBytes !== 0x2000) {
      throw Mapper34Board.configurationError(
        cartridge,
        "NINA-001 requires its unbanked 8 KiB PRG RAM",
      );
    }
    Mapper34Board.requireDirectPrgRam(cartridge);
  }

  private static validateBnrom(cartridge: Cartridge): void {
    if (![0x8000, 0x10_000, 0x20_000].includes(cartridge.prgRom.byteLength)) {
      throw Mapper34Board.configurationError(
        cartridge,
        "BNROM requires 32, 64 or 128 KiB of PRG ROM",
      );
    }
    if (cartridge.chrMemoryBytes !== 0x2000) {
      throw Mapper34Board.configurationError(
        cartridge,
        "BNROM requires 8 KiB of unbanked CHR memory",
      );
    }
    Mapper34Board.requireDirectPrgRam(cartridge);
  }

  private static requireDirectPrgRam(cartridge: Cartridge): void {
    if (cartridge.prgWritableBytes > 0x2000) {
      throw Mapper34Board.configurationError(cartridge, "PRG RAM must fit the direct 8 KiB window");
    }
    if (cartridge.prgRamBytes > 0 && cartridge.prgNvRamBytes > 0) {
      throw Mapper34Board.configurationError(
        cartridge,
        "mixed PRG RAM/NVRAM is not supported by this board",
      );
    }
  }

  private static configurationError(
    cartridge: Cartridge,
    reason: string,
  ): UnsupportedMapperConfigurationError {
    return new UnsupportedMapperConfigurationError(
      cartridge.mapperNumber,
      cartridge.submapperNumber,
      reason,
    );
  }
}
