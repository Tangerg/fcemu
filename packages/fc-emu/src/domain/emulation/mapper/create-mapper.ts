import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import {
  findAddressLatchMulticartBoard,
  type AddressLatchMulticartBoard,
} from "./address-latch-multicart-board.js";
import { AddressLatchMulticartMapper } from "./address-latch-multicart-mapper.js";
import { AxromMapper } from "./axrom-mapper.js";
import { Bandai74Mapper } from "./bandai74-mapper.js";
import { BandaiFcgMapper, type BandaiFcgBoard } from "./bandai-fcg-mapper.js";
import { Bmc226Mapper } from "./bmc-226-mapper.js";
import { BnromMapper } from "./bnrom-mapper.js";
import { CeSupertoneMapper } from "./ce-supertone-mapper.js";
import { CnromProtectionMapper } from "./cnrom-protection-mapper.js";
import { CnromMapper } from "./cnrom-mapper.js";
import { CodemastersMapper } from "./codemasters-mapper.js";
import { ColorDreamsMapper } from "./color-dreams-mapper.js";
import { CpromMapper } from "./cprom-mapper.js";
import { findConyYokoBoard, type ConyYokoBoard } from "./cony-yoko-board.js";
import { ConyYokoMapper } from "./cony-yoko-mapper.js";
import { Ej0061Mapper } from "./ej-006-1-mapper.js";
import { findFfeMagicCardBoard, type FfeMagicCardBoard } from "./ffe-magic-card-board.js";
import { FfeMagicCardMapper } from "./ffe-magic-card-mapper.js";
import { Fme7Mapper } from "./fme7-mapper.js";
import { GxromMapper } from "./gxrom-mapper.js";
import { HesNtd8Mapper } from "./hes-ntd8-mapper.js";
import { Irem78Mapper, type Irem78Mirroring } from "./irem78-mapper.js";
import { IremG101Mapper, type IremG101Board } from "./irem-g101-mapper.js";
import { IremH3001Mapper } from "./irem-h3001-mapper.js";
import { IremLrog017Mapper } from "./irem-lrog017-mapper.js";
import { IremTamS1Mapper } from "./irem-tam-s1-mapper.js";
import { JalecoJf17Mapper } from "./jaleco-jf17-mapper.js";
import { JalecoJfMapper } from "./jaleco-jf-mapper.js";
import { JalecoMapper } from "./jaleco-mapper.js";
import { JalecoSs8806Mapper } from "./jaleco-ss8806-mapper.js";
import { JyCompanyMapper } from "./jy-company-mapper.js";
import { Jy830623cMapper } from "./jy-830623c-mapper.js";
import { Kasheng115Mapper } from "./kasheng-115-mapper.js";
import { resolveMapper34Board } from "./mapper34-board.js";
import { Mmc1Board } from "./mmc1-board.js";
import { Mmc1Mapper } from "./mmc1-mapper.js";
import { Mmc2Mapper } from "./mmc2-mapper.js";
import { Mmc3Mapper } from "./mmc3-mapper.js";
import { Mmc4Mapper } from "./mmc4-mapper.js";
import { Mmc5Mapper } from "./mmc5-mapper.js";
import type { Mapper, MapperInterruptPort } from "./mapper.js";
import {
  MAPPER_76_BOARD,
  MAPPER_88_BOARD,
  MAPPER_95_BOARD,
  Namco118Mapper,
} from "./namco118-mapper.js";
import { Namco163Mapper, type Namco163AudioLevel } from "./namco163-mapper.js";
import { NromMapper } from "./nrom-mapper.js";
import { NtdecAsderMapper } from "./ntdec-asder-mapper.js";
import { Nina0306Mapper } from "./nina0306-mapper.js";
import { Nina001Mapper } from "./nina001-mapper.js";
import { OekaKidsMapper } from "./oeka-kids-mapper.js";
import { Rambo1Mapper } from "./rambo1-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import { TaitoTc0190Mapper } from "./taito-tc0190-mapper.js";
import { TaitoTc0690Mapper, type TaitoTc0690IrqRevision } from "./taito-tc0690-mapper.js";
import { TaitoX1005Mapper } from "./taito-x1-005-mapper.js";
import { TaitoX1017Mapper } from "./taito-x1-017-mapper.js";
import { TxcMmc3189Mapper } from "./txc-mmc3-189-mapper.js";
import { Sunsoft1Mapper } from "./sunsoft1-mapper.js";
import { Sunsoft2Mapper } from "./sunsoft2-mapper.js";
import { Sunsoft3Mapper } from "./sunsoft3-mapper.js";
import { Sunsoft3RMapper } from "./sunsoft3r-mapper.js";
import { Sunsoft4Mapper } from "./sunsoft4-mapper.js";
import { SuperGame114Mapper, type SuperGame114Variant } from "./supergame-114-mapper.js";
import {
  createInvertedUxromBoard,
  GENERIC_UXROM_BOARD,
  UN1ROM_BOARD,
  UxromMapper,
} from "./uxrom-mapper.js";
import { Vrc1Mapper } from "./vrc1-mapper.js";
import { Vrc3Mapper } from "./vrc3-mapper.js";
import { findVrc24Board, type Vrc24Board } from "./vrc2-vrc4-board.js";
import { Vrc2Vrc4Mapper } from "./vrc2-vrc4-mapper.js";
import { Vrc6Mapper } from "./vrc6-mapper.js";
import { Vrc7Mapper, type Vrc7Board } from "./vrc7-mapper.js";
import { VsSystemMapper } from "./vs-system-mapper.js";
import { WaixingF003Mapper } from "./waixing-f003-mapper.js";

/** Selects cartridge hardware from mapper/submapper identity and validates its bank layout. */
export function createMapper(cartridge: Cartridge, interruptPort: MapperInterruptPort): Mapper {
  switch (cartridge.mapperNumber) {
    case 0:
      requireBaseSubmapper(cartridge);
      requireRomLayout(cartridge, [0x4000, 0x8000], 0x2000);
      requireDirectPrgRam(cartridge);
      return new NromMapper(cartridge);
    case 1:
      requireBankedLayout(cartridge, 0x4000, 0x8000, 0x1000, 0x2000);
      requireTwoScreenNametables(cartridge, "MMC1");
      return new Mmc1Mapper(cartridge, Mmc1Board.resolve(cartridge));
    case 2:
      requireBankedLayout(cartridge, 0x4000, 0x8000, 0x2000, 0x2000);
      requireWritableChrSize(cartridge, 0x2000);
      requireDirectPrgRam(cartridge);
      return new UxromMapper(cartridge, {
        ...GENERIC_UXROM_BOARD,
        hasBusConflicts: resolveBusConflicts(cartridge, false),
      });
    case 3:
      requireCnromLayout(cartridge);
      requireWritableChrSize(cartridge, 0x2000);
      requireDirectPrgRam(cartridge);
      return new CnromMapper(cartridge, resolveBusConflicts(cartridge, false));
    case 4:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x80_000, 0x40_000);
      requireWritableChrSize(cartridge, 0x2000);
      requireMmc3PrgRam(cartridge);
      return new Mmc3Mapper(interruptPort, cartridge);
    case 5:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x100_000, 0x100_000);
      requireChrRom(cartridge, "MMC5");
      requireTwoScreenNametables(cartridge, "MMC5");
      requireMmc5PrgRam(cartridge);
      return new Mmc5Mapper(interruptPort, cartridge);
    case 6:
    case 8:
    case 17: {
      const board = resolveFfeMagicCardBoard(cartridge);
      requireFfeMagicCardLayout(cartridge, board);
      return new FfeMagicCardMapper(interruptPort, cartridge, board);
    }
    case 7:
      requireBankedLayout(cartridge, 0x8000, 0x8000, 0x2000, 0x2000);
      requireMaximumRomSize(cartridge, 0x80_000, 0);
      requireWritableChrSize(cartridge, 0x2000);
      if (!cartridge.hasWritableChrMemory) {
        throw configurationError(cartridge, "AxROM requires 8 KiB of writable CHR memory");
      }
      if (cartridge.format === "nes2" && cartridge.prgWritableBytes > 0) {
        throw configurationError(cartridge, "AxROM does not map PRG RAM");
      }
      requireTwoScreenNametables(cartridge, "AxROM");
      return new AxromMapper(cartridge, resolveBusConflicts(cartridge, false));
    case 9:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x1000, 0x1000);
      requireMaximumRomSize(cartridge, 0x20_000, 0x40_000);
      requireNoPrgRam(cartridge);
      requireTwoScreenNametables(cartridge, "MMC2");
      return new Mmc2Mapper(cartridge);
    case 10:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x4000, 0x8000, 0x1000, 0x1000);
      requireMaximumRomSize(cartridge, 0x40_000, 0x40_000);
      requireDirectPrgRam(cartridge);
      requireTwoScreenNametables(cartridge, "MMC4");
      return new Mmc4Mapper(cartridge);
    case 11:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x8000, 0x8000, 0x2000, 0x2000);
      requireMaximumRomSize(cartridge, 0x20_000, 0x20_000);
      requireNoPrgRam(cartridge);
      return new ColorDreamsMapper(cartridge);
    case 13:
      requireBaseSubmapper(cartridge);
      requireRomLayout(cartridge, [0x8000], 0x4000);
      if (!cartridge.hasWritableChrMemory) {
        throw configurationError(cartridge, "CPROM requires 16 KiB of writable CHR RAM");
      }
      requireNoPrgRam(cartridge);
      return new CpromMapper(cartridge);
    case 15:
      return createAddressLatchMulticartMapper(cartridge);
    case 16: {
      const board = resolveBandaiFcgBoard(cartridge);
      requireBankedLayout(cartridge, 0x4000, 0x8000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x40_000, 0x40_000);
      requireChrRom(cartridge, "Bandai FCG");
      requireTwoScreenNametables(cartridge, "Bandai FCG");
      requireBandaiFcgMemory(cartridge, board);
      return new BandaiFcgMapper(interruptPort, cartridge, board);
    }
    case 18:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x80_000, 0x40_000);
      requireChrRom(cartridge, "Jaleco SS8806");
      requireOptional8KiBPrgRam(cartridge, "Jaleco SS8806");
      requireTwoScreenNametables(cartridge, "Jaleco SS8806");
      return new JalecoSs8806Mapper(interruptPort, cartridge);
    case 19: {
      const audioLevel = resolveNamco163AudioLevel(cartridge);
      requireNamco163Layout(cartridge);
      return new Namco163Mapper(interruptPort, cartridge, audioLevel);
    }
    case 21:
    case 22:
    case 23:
    case 25: {
      const board = resolveVrc24Board(cartridge);
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x40_000, board.maximumChrBytes);
      requireChrRom(cartridge, "Konami VRC2/VRC4");
      requireTwoScreenNametables(cartridge, "Konami VRC2/VRC4");
      requireVrc24Memory(cartridge, board);
      return new Vrc2Vrc4Mapper(interruptPort, cartridge, board);
    }
    case 24:
    case 26:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x40_000, 0x40_000);
      requireChrRom(cartridge, "Konami VRC6");
      requireTwoScreenNametables(cartridge, "Konami VRC6");
      requireVrc6Memory(cartridge);
      return new Vrc6Mapper(
        interruptPort,
        cartridge,
        cartridge.mapperNumber === 24 ? "vrc6a" : "vrc6b",
      );
    case 32:
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x40_000, 0x40_000);
      requireChrRom(cartridge, "Irem G-101");
      requireNoPrgRam(cartridge);
      requireTwoScreenNametables(cartridge, "Irem G-101");
      return new IremG101Mapper(cartridge, resolveIremG101Board(cartridge));
    case 33:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x80_000, 0x80_000);
      requireChrRom(cartridge, "Taito TC0190");
      requireNoPrgRam(cartridge);
      requireTwoScreenNametables(cartridge, "Taito TC0190");
      return new TaitoTc0190Mapper(cartridge);
    case 34: {
      const board = resolveMapper34Board(cartridge);
      return board === "nina-001" ? new Nina001Mapper(cartridge) : new BnromMapper(cartridge);
    }
    case 48:
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x80_000, 0x80_000);
      requireChrRom(cartridge, "Taito TC0690");
      requireNoPrgRam(cartridge);
      requireTwoScreenNametables(cartridge, "Taito TC0690");
      return new TaitoTc0690Mapper(interruptPort, cartridge, resolveTaitoTc0690Revision(cartridge));
    case 64:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x40_000, 0x40_000);
      requireChrRom(cartridge, "Tengen 800032");
      requireNoPrgRam(cartridge);
      requireTwoScreenNametables(cartridge, "Tengen 800032");
      return new Rambo1Mapper(interruptPort, cartridge);
    case 65:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x80_000, 0x40_000);
      requireChrRom(cartridge, "Irem H3001");
      requireDirectPrgRam(cartridge);
      requireTwoScreenNametables(cartridge, "Irem H3001");
      return new IremH3001Mapper(interruptPort, cartridge);
    case 66:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x8000, 0x8000, 0x2000, 0x2000);
      requireMaximumRomSize(cartridge, 0x20_000, 0x8000);
      requireNoPrgRam(cartridge);
      return new GxromMapper(cartridge);
    case 67:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x4000, 0x8000, 0x0800, 0x2000);
      requireMaximumRomSize(cartridge, 0x40_000, 0x20_000);
      requireChrRom(cartridge, "Sunsoft-3");
      requireNoPrgRam(cartridge);
      requireTwoScreenNametables(cartridge, "Sunsoft-3");
      return new Sunsoft3Mapper(interruptPort, cartridge);
    case 68:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x4000, 0x8000, 0x0800, 0x2000);
      requireMaximumRomSize(cartridge, 0x40_000, 0x40_000);
      requireChrRom(cartridge, "Sunsoft-4");
      requireDirectPrgRam(cartridge);
      requireTwoScreenNametables(cartridge, "Sunsoft-4");
      return new Sunsoft4Mapper(cartridge);
    case 69:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x80_000, 0x40_000);
      requireDirectPrgRam(cartridge);
      requireTwoScreenNametables(cartridge, "FME-7");
      return new Fme7Mapper(interruptPort, cartridge);
    case 70:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x4000, 0x8000, 0x2000, 0x2000);
      requireMaximumRomSize(cartridge, 0x40_000, 0x20_000);
      requireNoPrgRam(cartridge);
      return new Bandai74Mapper(cartridge, false);
    case 71: {
      requireBankedLayout(cartridge, 0x4000, 0x8000, 0x2000, 0x2000);
      requireMaximumRomSize(cartridge, 0x40_000, 0x2000);
      requireWritableChrSize(cartridge, 0x2000);
      requireNoPrgRam(cartridge);
      const hasMirroringControl = requireCodemastersMirroring(cartridge);
      if (hasMirroringControl) requireTwoScreenNametables(cartridge, "Codemasters BF9097");
      return new CodemastersMapper(cartridge, hasMirroringControl);
    }
    case 72:
      requireBaseSubmapper(cartridge);
      requireRomLayout(cartridge, [0x20_000], 0x20_000);
      requireChrRom(cartridge, "Jaleco JF-17 mapper 72");
      requireNoPrgRam(cartridge);
      requireTwoScreenNametables(cartridge, "Jaleco JF-17 mapper 72");
      return new JalecoJf17Mapper(cartridge);
    case 73:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x4000, 0x8000, 0x2000, 0x2000);
      requireMaximumRomSize(cartridge, 0x20_000, 0x2000);
      requireChrRam(cartridge, "Konami VRC3");
      requireOptional8KiBPrgRam(cartridge, "Konami VRC3");
      requireTwoScreenNametables(cartridge, "Konami VRC3");
      return new Vrc3Mapper(interruptPort, cartridge);
    case 74:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x2000, 0x20_000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x80_000, 0x40_000);
      requireWaixingTypeAChrMemory(cartridge);
      requireMmc3PrgRam(cartridge);
      requireTwoScreenNametables(cartridge, "Waixing Type A");
      return new Mmc3Mapper(interruptPort, cartridge, "waixing-type-a");
    case 75:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x1000, 0x2000);
      requireMaximumRomSize(cartridge, 0x20_000, 0x20_000);
      requireChrRom(cartridge, "VRC1");
      requireNoPrgRam(cartridge);
      return new Vrc1Mapper(cartridge);
    case 76:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0800, 0x2000);
      requireMaximumRomSize(cartridge, 0x20_000, 0x20_000);
      requireChrRom(cartridge, "Namco 3446");
      requireNoPrgRam(cartridge);
      return new Namco118Mapper(cartridge, MAPPER_76_BOARD);
    case 77:
      requireBaseSubmapper(cartridge);
      requireIremLrog017Layout(cartridge);
      return new IremLrog017Mapper(cartridge);
    case 78:
      requireBankedLayout(cartridge, 0x4000, 0x8000, 0x2000, 0x2000);
      requireMaximumRomSize(cartridge, 0x20_000, 0x20_000);
      requireChrRom(cartridge, "mapper 78");
      requireNoPrgRam(cartridge);
      if (cartridge.format === "nes2") requireTwoScreenNametables(cartridge, "mapper 78");
      return new Irem78Mapper(cartridge, resolveIrem78Mirroring(cartridge));
    case 79:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x8000, 0x8000, 0x2000, 0x2000);
      requireMaximumRomSize(cartridge, 0x10_000, 0x10_000);
      requireChrRom(cartridge, "NINA-03/NINA-06");
      requireNoPrgRam(cartridge);
      requireTwoScreenNametables(cartridge, "NINA-03/NINA-06");
      return new Nina0306Mapper(cartridge);
    case 80:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x40_000, 0x40_000);
      requireChrRom(cartridge, "Taito X1-005");
      requireTaitoX1005Ram(cartridge);
      requireTwoScreenNametables(cartridge, "Taito X1-005");
      return new TaitoX1005Mapper(cartridge);
    case 82:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x20_000, 0x40_000);
      requireChrRom(cartridge, "Taito X1-017");
      requireTaitoX1017Ram(cartridge);
      requireTwoScreenNametables(cartridge, "Taito X1-017");
      return new TaitoX1017Mapper(interruptPort, cartridge);
    case 83: {
      const board = resolveConyYokoBoard(cartridge);
      requireConyYokoLayout(cartridge, board);
      return new ConyYokoMapper(interruptPort, cartridge, board);
    }
    case 85:
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x80_000, 0x40_000);
      requireOptional8KiBPrgRam(cartridge, "Konami VRC7");
      requireTwoScreenNametables(cartridge, "Konami VRC7");
      return new Vrc7Mapper(interruptPort, cartridge, resolveVrc7Board(cartridge));
    case 87:
      requireBaseSubmapper(cartridge);
      requireJalecoLayout(cartridge);
      requireNoPrgRam(cartridge);
      return new JalecoMapper(cartridge);
    case 88:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x20_000, 0x20_000);
      requireChrRom(cartridge, "Namco 3433/3443");
      requireNoPrgRam(cartridge);
      return new Namco118Mapper(cartridge, MAPPER_88_BOARD);
    case 89:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x4000, 0x8000, 0x2000, 0x2000);
      requireMaximumRomSize(cartridge, 0x20_000, 0x20_000);
      requireChrRom(cartridge, "Sunsoft-2");
      requireNoPrgRam(cartridge);
      requireTwoScreenNametables(cartridge, "Sunsoft-2");
      return new Sunsoft2Mapper(cartridge);
    case 90:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x200_000, 0x200_000);
      requireOptional8KiBPrgRam(cartridge, "J.Y. Company mapper 90");
      requireTwoScreenNametables(cartridge, "J.Y. Company mapper 90");
      return new JyCompanyMapper(interruptPort, cartridge);
    case 91:
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0800, 0x2000);
      requireChrRom(cartridge, "mapper 91");
      requireNoPrgRam(cartridge);
      requireTwoScreenNametables(cartridge, "mapper 91");
      switch (cartridge.submapperNumber) {
        case 0:
          requireMaximumRomSize(cartridge, 0x80_000, 0x100_000);
          return new Jy830623cMapper(interruptPort, cartridge);
        case 1:
          requireMaximumRomSize(cartridge, 0x20_000, 0x80_000);
          return new Ej0061Mapper(interruptPort, cartridge);
        default:
          throw new UnsupportedMapperVariantError(
            cartridge.mapperNumber,
            cartridge.submapperNumber,
          );
      }
    case 93:
      requireBaseSubmapper(cartridge);
      requireRomLayout(cartridge, [0x8000, 0x10_000, 0x20_000], 0x2000);
      requireChrRam(cartridge, "Sunsoft-3R");
      requireNoPrgRam(cartridge);
      return new Sunsoft3RMapper(cartridge);
    case 94:
      requireBaseSubmapper(cartridge);
      requireRomLayout(cartridge, [0x20_000], 0x2000);
      requireChrRam(cartridge, "UN1ROM");
      requireNoPrgRam(cartridge);
      return new UxromMapper(cartridge, UN1ROM_BOARD);
    case 95:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x20_000, 0x10_000);
      requireChrRom(cartridge, "Namco 3425");
      requireNoPrgRam(cartridge);
      requireTwoScreenNametables(cartridge, "Namco 3425");
      return new Namco118Mapper(cartridge, MAPPER_95_BOARD);
    case 96:
      requireBaseSubmapper(cartridge);
      requireRomLayout(cartridge, [0x20_000], 0x8000);
      requireChrRam(cartridge, "Bandai Oeka Kids mapper 96");
      requireNoBatteryPrgRam(cartridge, "Bandai Oeka Kids mapper 96");
      requireTwoScreenNametables(cartridge, "Bandai Oeka Kids mapper 96");
      return new OekaKidsMapper(cartridge);
    case 97:
      requireBaseSubmapper(cartridge);
      requireRomLayout(cartridge, [0x40_000], 0x2000);
      requireChrRam(cartridge, "Irem TAM-S1");
      requireNoPrgRam(cartridge);
      requireTwoScreenNametables(cartridge, "Irem TAM-S1");
      return new IremTamS1Mapper(cartridge);
    case 99:
      requireBaseSubmapper(cartridge);
      requireVsSystemMapperLayout(cartridge);
      return new VsSystemMapper(cartridge);
    case 112:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x20_000, 0x80_000);
      requireChrRom(cartridge, "NTDEC/Asder mapper 112");
      requireNoPrgRam(cartridge);
      requireTwoScreenNametables(cartridge, "NTDEC/Asder mapper 112");
      return new NtdecAsderMapper(cartridge);
    case 113:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x8000, 0x8000, 0x2000, 0x2000);
      requireMaximumRomSize(cartridge, 0x40_000, 0x20_000);
      requireChrRom(cartridge, "HES NTD-8");
      requireNoPrgRam(cartridge);
      requireTwoScreenNametables(cartridge, "HES NTD-8");
      return new HesNtd8Mapper(cartridge);
    case 114:
      if (cartridge.submapperNumber !== 0 && cartridge.submapperNumber !== 1) {
        throw new UnsupportedMapperVariantError(cartridge.mapperNumber, cartridge.submapperNumber);
      }
      return createSuperGameMapper(cartridge, interruptPort, cartridge.submapperNumber);
    case 115:
      return createKashengMapper(cartridge, interruptPort);
    case 118:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x80_000, 0x40_000);
      requireChrRom(cartridge, "TxSROM");
      requireMmc3PrgRam(cartridge);
      requireTwoScreenNametables(cartridge, "TxSROM");
      return new Mmc3Mapper(interruptPort, cartridge, "txsrom");
    case 119:
      requireBaseSubmapper(cartridge);
      requireTqromLayout(cartridge);
      requireNoPrgRam(cartridge);
      requireTwoScreenNametables(cartridge, "TQROM");
      return new Mmc3Mapper(interruptPort, cartridge, "tqrom");
    case 140:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x8000, 0x8000, 0x2000, 0x2000);
      requireMaximumRomSize(cartridge, 0x20_000, 0x20_000);
      requireChrRom(cartridge, "Jaleco JF-11/JF-14");
      requireNoPrgRam(cartridge);
      return new JalecoJfMapper(cartridge);
    case 152:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x4000, 0x8000, 0x2000, 0x2000);
      requireMaximumRomSize(cartridge, 0x20_000, 0x20_000);
      requireNoPrgRam(cartridge);
      requireTwoScreenNametables(cartridge, "Bandai mapper 152");
      return new Bandai74Mapper(cartridge, true);
    case 180:
      requireBankedLayout(cartridge, 0x4000, 0x8000, 0x2000, 0x2000);
      requireMaximumRomSize(cartridge, 0x20_000, 0x2000);
      requireChrRam(cartridge, "inverted UxROM");
      requireNoPrgRam(cartridge);
      return new UxromMapper(
        cartridge,
        createInvertedUxromBoard(resolveBusConflicts(cartridge, true)),
      );
    case 182:
      requireBaseSubmapper(cartridge);
      return createSuperGameMapper(cartridge, interruptPort, 0);
    case 184:
      requireBaseSubmapper(cartridge);
      requireSunsoft1Layout(cartridge);
      requireChrRom(cartridge, "Sunsoft-1");
      requireNoPrgRam(cartridge);
      return new Sunsoft1Mapper(cartridge);
    case 185:
      requireRomLayout(cartridge, [0x4000, 0x8000], 0x2000);
      requireChrRom(cartridge, "CNROM protection");
      requireNoPrgRam(cartridge);
      return new CnromProtectionMapper(cartridge, resolveCnromProtectionChip(cartridge));
    case 189:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x8000, 0x20_000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x40_000, 0x40_000);
      requireChrRom(cartridge, "TXC mapper 189");
      requireNoPrgRam(cartridge);
      requireTwoScreenNametables(cartridge, "TXC mapper 189");
      return new TxcMmc3189Mapper(interruptPort, cartridge);
    case 206:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x20_000, 0x10_000);
      requireNoPrgRam(cartridge);
      return new Namco118Mapper(cartridge);
    case 225:
      return createAddressLatchMulticartMapper(cartridge);
    case 226:
      requireBaseSubmapper(cartridge);
      requireRomLayout(cartridge, [0x100_000, 0x180_000, 0x200_000], 0x2000);
      requireVolatileChrRam(cartridge, "BMC mapper 226");
      requireNoBatteryPrgRam(cartridge, "BMC mapper 226");
      requireTwoScreenNametables(cartridge, "BMC mapper 226");
      return new Bmc226Mapper(cartridge);
    case 227:
    case 228:
      return createAddressLatchMulticartMapper(cartridge);
    case 240:
      requireBaseSubmapper(cartridge);
      requireRomLayout(cartridge, [0x20_000], 0x20_000);
      requireChrRom(cartridge, "C&E/Supertone mapper 240");
      requireDirectPrgRam(cartridge);
      if (cartridge.prgWritableBytes !== 0x2000) {
        throw configurationError(
          cartridge,
          "C&E/Supertone mapper 240 requires exactly 8 KiB of PRG RAM or NVRAM",
        );
      }
      requireTwoScreenNametables(cartridge, "C&E/Supertone mapper 240");
      return new CeSupertoneMapper(cartridge);
    case 242:
      return createAddressLatchMulticartMapper(cartridge);
    case 245:
      requireBaseSubmapper(cartridge);
      requireRomLayout(cartridge, [0x20_000, 0x40_000, 0x80_000, 0x100_000], 0x2000);
      requireVolatileChrRam(cartridge, "Waixing F003");
      requireWaixingF003PrgNvRam(cartridge);
      requireTwoScreenNametables(cartridge, "Waixing F003");
      return new WaixingF003Mapper(interruptPort, cartridge);
    case 248:
      return createKashengMapper(cartridge, interruptPort);
    default:
      throw new UnsupportedMapperError(cartridge.mapperNumber);
  }
}

function createSuperGameMapper(
  cartridge: Cartridge,
  interruptPort: MapperInterruptPort,
  variant: SuperGame114Variant,
): SuperGame114Mapper {
  const boardName = `SuperGame mapper ${cartridge.mapperNumber}`;
  requireBankedLayout(cartridge, 0x2000, 0x20_000, 0x0400, 0x2000);
  requireMaximumRomSize(cartridge, 0x40_000, 0x80_000);
  requireChrRom(cartridge, boardName);
  requireNoBatteryPrgRam(cartridge, boardName);
  requireTwoScreenNametables(cartridge, boardName);
  return new SuperGame114Mapper(interruptPort, cartridge, variant);
}

function createKashengMapper(
  cartridge: Cartridge,
  interruptPort: MapperInterruptPort,
): Kasheng115Mapper {
  const boardName = `Kasheng mapper ${cartridge.mapperNumber}`;
  requireBaseSubmapper(cartridge);
  requireBankedLayout(cartridge, 0x2000, 0x20_000, 0x0400, 0x2000);
  requireMaximumRomSize(cartridge, 0x80_000, 0x80_000);
  requireChrRom(cartridge, boardName);
  requireNoBatteryPrgRam(cartridge, boardName);
  requireTwoScreenNametables(cartridge, boardName);
  return new Kasheng115Mapper(interruptPort, cartridge);
}

function createAddressLatchMulticartMapper(cartridge: Cartridge): AddressLatchMulticartMapper {
  const board = findAddressLatchMulticartBoard(cartridge.mapperNumber, cartridge.submapperNumber);
  if (!board) {
    throw new UnsupportedMapperVariantError(cartridge.mapperNumber, cartridge.submapperNumber);
  }
  requireAddressLatchMulticartLayout(cartridge, board);
  return new AddressLatchMulticartMapper(cartridge, board);
}

function requireAddressLatchMulticartLayout(
  cartridge: Cartridge,
  board: AddressLatchMulticartBoard,
): void {
  requireTwoScreenNametables(cartridge, board.id);
  switch (board.mapperNumber) {
    case 15:
      requireRomLayout(cartridge, [0x100_000], 0x2000);
      requireVolatileChrRam(cartridge, board.id);
      requireNoBatteryPrgRam(cartridge, board.id);
      return;
    case 225:
      if (!(
        (cartridge.prgRom.byteLength === 0x100_000 && cartridge.chrRom.byteLength === 0x80_000) ||
        (cartridge.prgRom.byteLength === 0x200_000 && cartridge.chrRom.byteLength === 0x100_000)
      )) {
        throw configurationError(
          cartridge,
          "ET-4310/K-1010 requires a 1 MiB/512 KiB or 2 MiB/1 MiB PRG/CHR pair",
        );
      }
      requireChrRom(cartridge, board.id);
      requireNoBatteryPrgRam(cartridge, board.id);
      return;
    case 227:
      requireRomLayout(cartridge, [0x100_000], 0x2000);
      requireVolatileChrRam(cartridge, board.id);
      if (board.exposesBatteryWram) {
        if (
          cartridge.format === "nes2" &&
          (cartridge.prgRamBytes !== 0 ||
            (cartridge.prgNvRamBytes !== 0 && cartridge.prgNvRamBytes !== 0x2000))
        ) {
          throw configurationError(
            cartridge,
            "mapper 227 submapper 0 accepts only optional 8 KiB PRG NVRAM",
          );
        }
      } else {
        requireNoBatteryPrgRam(cartridge, board.id);
      }
      return;
    case 228:
      requireRomLayout(cartridge, [0x80_000, 0x180_000], 0x80_000);
      requireChrRom(cartridge, board.id);
      requireNoBatteryPrgRam(cartridge, board.id);
      return;
    case 242:
      requireRomLayout(cartridge, [0x80_000], 0x2000);
      requireVolatileChrRam(cartridge, board.id);
      if (cartridge.hasBatteryBackup) {
        if (cartridge.prgRamBytes !== 0 || cartridge.prgNvRamBytes !== 0x2000) {
          throw configurationError(
            cartridge,
            "mapper 242 RPG boards require exactly 8 KiB of PRG NVRAM",
          );
        }
      } else {
        requireNoPrgRam(cartridge);
      }
  }
}

function requireMaximumRomSize(
  cartridge: Cartridge,
  maximumPrgBytes: number,
  maximumChrBytes: number,
): void {
  if (cartridge.prgRom.byteLength > maximumPrgBytes) {
    throw configurationError(cartridge, `PRG ROM cannot exceed ${formatBytes(maximumPrgBytes)}`);
  }
  if (maximumChrBytes > 0 && cartridge.chrMemoryBytes > maximumChrBytes) {
    throw configurationError(cartridge, `CHR memory cannot exceed ${formatBytes(maximumChrBytes)}`);
  }
}

function requireWritableChrSize(cartridge: Cartridge, requiredBytes: number): void {
  if (cartridge.hasWritableChrMemory && cartridge.chrMemoryBytes !== requiredBytes) {
    throw configurationError(
      cartridge,
      `writable CHR memory must be ${formatBytes(requiredBytes)}`,
    );
  }
}

function requireChrRom(cartridge: Cartridge, board: string): void {
  if (cartridge.hasWritableChrMemory) {
    throw configurationError(cartridge, `${board} requires CHR ROM`);
  }
}

function requireChrRam(cartridge: Cartridge, board: string): void {
  if (!cartridge.hasWritableChrMemory) {
    throw configurationError(cartridge, `${board} requires writable CHR RAM`);
  }
}

function requireVolatileChrRam(cartridge: Cartridge, board: string): void {
  if (
    cartridge.chrRom.byteLength !== 0 ||
    cartridge.chrRamBytes !== 0x2000 ||
    cartridge.chrNvRamBytes !== 0
  ) {
    throw configurationError(cartridge, `${board} requires exactly 8 KiB of volatile CHR RAM`);
  }
}

function requireNoBatteryPrgRam(cartridge: Cartridge, board: string): void {
  requireNoPrgRam(cartridge);
  if (cartridge.hasBatteryBackup) {
    throw configurationError(cartridge, `${board} has no battery-backed writable memory`);
  }
}

function requireMmc3PrgRam(cartridge: Cartridge): void {
  requireDirectPrgRam(cartridge);
  if (cartridge.prgWritableBytes !== 0 && cartridge.prgWritableBytes !== 0x2000) {
    throw configurationError(cartridge, "MMC3 PRG RAM must be 8 KiB when present");
  }
}

function requireWaixingF003PrgNvRam(cartridge: Cartridge): void {
  if (
    !cartridge.hasBatteryBackup ||
    cartridge.prgRamBytes !== 0 ||
    cartridge.prgNvRamBytes !== 0x2000
  ) {
    throw configurationError(cartridge, "Waixing F003 requires 8 KiB of battery-backed PRG NVRAM");
  }
}

function requireWaixingTypeAChrMemory(cartridge: Cartridge): void {
  if (
    cartridge.chrRom.byteLength === 0 ||
    cartridge.chrRamBytes !== 0x0800 ||
    cartridge.chrNvRamBytes !== 0
  ) {
    throw configurationError(
      cartridge,
      "Waixing Type A requires CHR ROM plus exactly 2 KiB of volatile CHR RAM",
    );
  }
}

function requireMmc5PrgRam(cartridge: Cartridge): void {
  const bytes = cartridge.prgWritableBytes;
  const valid8KiB = bytes === 0x2000;
  const validEtrom =
    bytes === 0x4000 && cartridge.prgRamBytes === 0x2000 && cartridge.prgNvRamBytes === 0x2000;
  const valid32KiB = bytes === 0x8000;
  if (bytes !== 0 && !valid8KiB && !validEtrom && !valid32KiB) {
    throw configurationError(
      cartridge,
      "MMC5 supports 0, 8 or 32 KiB PRG RAM, or ETROM's mixed 8 KiB RAM + 8 KiB NVRAM",
    );
  }
}

function requireTaitoX1005Ram(cartridge: Cartridge): void {
  if (
    cartridge.prgWritableBytes !== 0x80 ||
    (cartridge.prgRamBytes > 0 && cartridge.prgNvRamBytes > 0)
  ) {
    throw configurationError(
      cartridge,
      "Taito X1-005 requires exactly 128 bytes of internal RAM or NVRAM",
    );
  }
}

function requireTaitoX1017Ram(cartridge: Cartridge): void {
  if (
    !cartridge.hasBatteryBackup ||
    cartridge.prgRamBytes !== 0 ||
    cartridge.prgNvRamBytes !== 0x1400
  ) {
    throw configurationError(cartridge, "Taito X1-017 requires 5 KiB of internal PRG NVRAM");
  }
}

function requireBandaiFcgMemory(cartridge: Cartridge, board: BandaiFcgBoard): void {
  const hasEeprom =
    cartridge.prgRamBytes === 0 && cartridge.prgNvRamBytes === 0x100 && cartridge.hasBatteryBackup;
  const hasNoExplicitMemory =
    cartridge.prgRamBytes === 0 && cartridge.prgNvRamBytes === 0 && !cartridge.hasBatteryBackup;
  const hasLegacyImplicitRam =
    cartridge.format === "ines" &&
    cartridge.prgRamBytes === 0x2000 &&
    cartridge.prgNvRamBytes === 0 &&
    !cartridge.hasBatteryBackup;
  if (
    (board === "fcg-1-2" && !hasNoExplicitMemory) ||
    (board !== "fcg-1-2" && !hasEeprom && !hasNoExplicitMemory && !hasLegacyImplicitRam)
  ) {
    throw configurationError(
      cartridge,
      board === "fcg-1-2"
        ? "FCG-1/2 does not provide writable PRG memory"
        : "LZ93D50 supports either no save memory or exactly 256 bytes of 24C02 NVRAM",
    );
  }
}

function requireFfeMagicCardLayout(cartridge: Cartridge, board: FfeMagicCardBoard): void {
  const minimumPrgBytes = board.hasSuperMagicCardFeatures
    ? 0x8000
    : board.initialLatchMode === 2 || board.initialLatchMode === 3
      ? 0x40_000
      : 0x20_000;
  if (
    cartridge.prgRom.byteLength < minimumPrgBytes ||
    cartridge.prgRom.byteLength > board.prgMemoryBytes
  ) {
    throw configurationError(
      cartridge,
      `FFE ${board.id} PRG image must be ${formatBytes(minimumPrgBytes)}-${formatBytes(board.prgMemoryBytes)}`,
    );
  }
  if (cartridge.chrMemoryBytes > board.chrMemoryBytes) {
    throw configurationError(
      cartridge,
      `FFE ${board.id} CHR initialization cannot exceed ${formatBytes(board.chrMemoryBytes)}`,
    );
  }
  if (cartridge.prgRamBytes !== 0x8000 || cartridge.prgNvRamBytes !== 0) {
    throw configurationError(cartridge, "FFE RAM cartridges require 32 KiB of volatile WRAM");
  }
  requireTwoScreenNametables(cartridge, `FFE ${board.id}`);
}

function requireConyYokoLayout(cartridge: Cartridge, board: ConyYokoBoard): void {
  requireBankedLayout(cartridge, 0x2000, board.innerPrgBytes, board.chrBankBytes, 0x2000);
  requireMaximumRomSize(cartridge, (board.prgAddressMask + 1) * 0x4000, board.maximumChrBytes);
  requireChrRom(cartridge, board.id);
  requireTwoScreenNametables(cartridge, board.id);

  if (board.maps32KiBPrgNvRam) {
    if (
      cartridge.format !== "nes2" ||
      !cartridge.hasBatteryBackup ||
      cartridge.prgRamBytes !== 0 ||
      cartridge.prgNvRamBytes !== 0x8000
    ) {
      throw configurationError(
        cartridge,
        `${board.id} requires exactly 32 KiB of battery-backed PRG NVRAM`,
      );
    }
    return;
  }
  requireNoBatteryPrgRam(cartridge, board.id);
}

function requireVrc24Memory(cartridge: Cartridge, board: Vrc24Board): void {
  requireDirectPrgRam(cartridge);
  const bytes = cartridge.prgWritableBytes;
  const accepted =
    board.chip === "vrc2" ? bytes === 0 || bytes === 0x2000 : [0, 0x0800, 0x2000].includes(bytes);
  if (!accepted) {
    throw configurationError(
      cartridge,
      board.chip === "vrc2"
        ? "VRC2 supports either its one-bit latch or exactly 8 KiB of PRG RAM"
        : "VRC4 PRG RAM must be absent, 2 KiB or 8 KiB",
    );
  }
}

function requireVrc6Memory(cartridge: Cartridge): void {
  requireDirectPrgRam(cartridge);
  if (cartridge.prgWritableBytes !== 0x2000) {
    throw configurationError(cartridge, "VRC6 requires exactly 8 KiB of PRG RAM or NVRAM");
  }
}

function resolveNamco163AudioLevel(cartridge: Cartridge): Namco163AudioLevel {
  switch (cartridge.submapperNumber) {
    case 0:
    case 3:
      return "12db";
    case 1:
    case 2:
      return "mute";
    case 4:
      return "16.5db";
    case 5:
      return "18.75db";
    default:
      throw new UnsupportedMapperVariantError(cartridge.mapperNumber, cartridge.submapperNumber);
  }
}

function requireNamco163Layout(cartridge: Cartridge): void {
  requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0400, 0x2000);
  requireMaximumRomSize(cartridge, 0x80_000, 0x40_000);
  requireTwoScreenNametables(cartridge, "Namco 163");

  const hasExternalWram = cartridge.prgWritableBytes === 0x2000;
  const validExternalMemory =
    (cartridge.prgRamBytes === 0 && cartridge.prgNvRamBytes === 0) ||
    (cartridge.prgRamBytes === 0x2000 && cartridge.prgNvRamBytes === 0) ||
    (cartridge.prgRamBytes === 0 &&
      cartridge.prgNvRamBytes === 0x2000 &&
      cartridge.hasBatteryBackup);
  if (!validExternalMemory) {
    throw configurationError(
      cartridge,
      "Namco 163 supports only optional 8 KiB external PRG RAM or NVRAM",
    );
  }
  if (cartridge.submapperNumber === 1 && hasExternalWram) {
    throw configurationError(
      cartridge,
      "Namco 129 submapper 1 has internal NVRAM but no external PRG RAM",
    );
  }
  if (cartridge.submapperNumber === 1 && !cartridge.hasBatteryBackup) {
    throw configurationError(
      cartridge,
      "Namco 129 submapper 1 requires battery-backed internal RAM",
    );
  }
  if (
    cartridge.mapperRamBytes + cartridge.mapperNvRamBytes !== 0x80 ||
    cartridge.chrNvRamBytes !== 0
  ) {
    throw configurationError(
      cartridge,
      "Namco 163 requires 128 bytes of internal RAM and does not battery-back CHR RAM",
    );
  }
  if (
    cartridge.chrRom.byteLength > 0 &&
    cartridge.chrWritableBytes > 0 &&
    (cartridge.chrWritableBytes > 0x8000 ||
      cartridge.chrWritableBytes % CHR_BANK_SIZE_FOR_VALIDATION !== 0)
  ) {
    throw configurationError(
      cartridge,
      "Namco 163 mixed CHR ROM/RAM supports at most 32 KiB of 1 KiB-banked CHR RAM",
    );
  }
}

const CHR_BANK_SIZE_FOR_VALIDATION = 0x0400;

function resolveVrc7Board(cartridge: Cartridge): Vrc7Board {
  switch (cartridge.submapperNumber) {
    case 0:
      return "vrc7-auto";
    case 1:
      return "vrc7b";
    case 2:
      return "vrc7a";
    default:
      throw new UnsupportedMapperVariantError(cartridge.mapperNumber, cartridge.submapperNumber);
  }
}

function requireTwoScreenNametables(cartridge: Cartridge, board: string): void {
  if (cartridge.mirroringMode === NametableMirroring.FourScreen) {
    throw configurationError(cartridge, `${board} does not provide four-screen nametable memory`);
  }
}

function requireTqromLayout(cartridge: Cartridge): void {
  if (cartridge.prgRom.byteLength !== 0x20_000) {
    throw configurationError(cartridge, "TQROM PRG ROM must be 128 KiB");
  }
  if (![0x4000, 0x8000, 0x10_000].includes(cartridge.chrRom.byteLength)) {
    throw configurationError(cartridge, "TQROM CHR ROM must be 16 KiB, 32 KiB or 64 KiB");
  }
  if (cartridge.chrWritableBytes !== 0x2000 || cartridge.chrNvRamBytes !== 0) {
    throw configurationError(cartridge, "TQROM requires 8 KiB of volatile CHR RAM");
  }
}

function requireIremLrog017Layout(cartridge: Cartridge): void {
  if (cartridge.prgRom.byteLength !== 0x20_000) {
    throw configurationError(cartridge, "Irem LROG017 PRG ROM must be 128 KiB");
  }
  if (cartridge.chrRom.byteLength !== 0x8000) {
    throw configurationError(cartridge, "Irem LROG017 CHR ROM must be 32 KiB");
  }
  if (cartridge.chrRamBytes !== 0x2000 || cartridge.chrNvRamBytes !== 0) {
    throw configurationError(cartridge, "Irem LROG017 requires 8 KiB of volatile CHR RAM");
  }
  requireNoBatteryPrgRam(cartridge, "Irem LROG017 mapper 77");
  if (cartridge.mirroringMode !== NametableMirroring.FourScreen) {
    throw configurationError(cartridge, "Irem LROG017 requires four-screen nametable wiring");
  }
}

function requireDirectPrgRam(cartridge: Cartridge): void {
  if (cartridge.prgWritableBytes > 0x2000) {
    throw configurationError(cartridge, "PRG RAM must fit the direct 8 KiB window");
  }
  if (cartridge.prgRamBytes > 0 && cartridge.prgNvRamBytes > 0) {
    throw configurationError(cartridge, "mixed PRG RAM/NVRAM requires mapper-controlled banking");
  }
}

function requireOptional8KiBPrgRam(cartridge: Cartridge, board: string): void {
  requireDirectPrgRam(cartridge);
  if (cartridge.prgWritableBytes !== 0 && cartridge.prgWritableBytes !== 0x2000) {
    throw configurationError(cartridge, `${board} PRG RAM must be 8 KiB when present`);
  }
}

/** Rejects explicit NES 2.0 memory that the selected board cannot decode. */
function requireNoPrgRam(cartridge: Cartridge): void {
  if (cartridge.format === "nes2" && cartridge.prgWritableBytes > 0) {
    throw configurationError(cartridge, "this board does not map PRG RAM");
  }
}

function resolveBusConflicts(cartridge: Cartridge, legacyDefault: boolean): boolean {
  switch (cartridge.submapperNumber) {
    case 0:
      return legacyDefault;
    case 1:
      return false;
    case 2:
      return true;
    default:
      throw new UnsupportedMapperVariantError(cartridge.mapperNumber, cartridge.submapperNumber);
  }
}

function requireBaseSubmapper(cartridge: Cartridge): void {
  if (cartridge.submapperNumber !== 0) {
    throw new UnsupportedMapperVariantError(cartridge.mapperNumber, cartridge.submapperNumber);
  }
}

/** Resolves whether the Codemasters board exposes BF9097 single-screen mirroring control. */
function requireCodemastersMirroring(cartridge: Cartridge): boolean {
  switch (cartridge.submapperNumber) {
    case 0:
      return false;
    case 1:
      return true;
    default:
      throw new UnsupportedMapperVariantError(cartridge.mapperNumber, cartridge.submapperNumber);
  }
}

function resolveIrem78Mirroring(cartridge: Cartridge): Irem78Mirroring {
  if (cartridge.format === "ines") {
    return cartridge.mirroringMode === NametableMirroring.FourScreen
      ? "horizontal-vertical"
      : "single-screen";
  }
  switch (cartridge.submapperNumber) {
    case 1:
      return "single-screen";
    case 3:
      return "horizontal-vertical";
    default:
      throw new UnsupportedMapperVariantError(cartridge.mapperNumber, cartridge.submapperNumber);
  }
}

function resolveIremG101Board(cartridge: Cartridge): IremG101Board {
  switch (cartridge.submapperNumber) {
    case 0:
      return "standard";
    case 1:
      return "major-league";
    default:
      throw new UnsupportedMapperVariantError(cartridge.mapperNumber, cartridge.submapperNumber);
  }
}

function resolveTaitoTc0690Revision(cartridge: Cartridge): TaitoTc0690IrqRevision {
  switch (cartridge.submapperNumber) {
    case 0:
      return "original";
    case 1:
      return "late";
    default:
      throw new UnsupportedMapperVariantError(cartridge.mapperNumber, cartridge.submapperNumber);
  }
}

function resolveBandaiFcgBoard(cartridge: Cartridge): BandaiFcgBoard {
  switch (cartridge.submapperNumber) {
    case 0:
      return "auto";
    case 4:
      return "fcg-1-2";
    case 5:
      return "lz93d50";
    default:
      throw new UnsupportedMapperVariantError(cartridge.mapperNumber, cartridge.submapperNumber);
  }
}

function resolveFfeMagicCardBoard(cartridge: Cartridge): FfeMagicCardBoard {
  const board = findFfeMagicCardBoard(
    cartridge.mapperNumber,
    cartridge.format,
    cartridge.submapperNumber,
  );
  if (!board) {
    throw new UnsupportedMapperVariantError(cartridge.mapperNumber, cartridge.submapperNumber);
  }
  return board;
}

function resolveVrc24Board(cartridge: Cartridge): Vrc24Board {
  const board = findVrc24Board(cartridge.mapperNumber, cartridge.submapperNumber);
  if (!board) {
    throw new UnsupportedMapperVariantError(cartridge.mapperNumber, cartridge.submapperNumber);
  }
  return board;
}

function resolveConyYokoBoard(cartridge: Cartridge): ConyYokoBoard {
  const board = findConyYokoBoard(
    cartridge.mapperNumber,
    cartridge.format,
    cartridge.submapperNumber,
  );
  if (!board) {
    throw new UnsupportedMapperVariantError(cartridge.mapperNumber, cartridge.submapperNumber);
  }
  return board;
}

function resolveCnromProtectionChip(cartridge: Cartridge): number {
  if (
    cartridge.format !== "nes2" ||
    cartridge.submapperNumber < 4 ||
    cartridge.submapperNumber > 7
  ) {
    throw new UnsupportedMapperVariantError(cartridge.mapperNumber, cartridge.submapperNumber);
  }
  return cartridge.submapperNumber - 4;
}

function requireRomLayout(
  cartridge: Cartridge,
  allowedPrgSizes: readonly number[],
  requiredChrSize: number,
): void {
  if (!allowedPrgSizes.includes(cartridge.prgRom.byteLength)) {
    throw configurationError(cartridge, `PRG ROM must be ${formatSizes(allowedPrgSizes)}`);
  }
  if (cartridge.chrMemoryBytes !== requiredChrSize) {
    throw configurationError(cartridge, `CHR memory must be ${formatBytes(requiredChrSize)}`);
  }
}

function requireBankedLayout(
  cartridge: Cartridge,
  prgBankSize: number,
  minimumPrgSize: number,
  chrBankSize: number,
  minimumChrSize: number,
): void {
  if (
    cartridge.prgRom.byteLength < minimumPrgSize ||
    cartridge.prgRom.byteLength % prgBankSize !== 0
  ) {
    throw configurationError(
      cartridge,
      `PRG ROM must be at least ${formatBytes(minimumPrgSize)} in ${formatBytes(prgBankSize)} banks`,
    );
  }
  if (cartridge.chrMemoryBytes < minimumChrSize || cartridge.chrMemoryBytes % chrBankSize !== 0) {
    throw configurationError(
      cartridge,
      `CHR memory must be at least ${formatBytes(minimumChrSize)} in ${formatBytes(chrBankSize)} banks`,
    );
  }
}

function requireJalecoLayout(cartridge: Cartridge): void {
  if (cartridge.prgRom.byteLength !== 0x4000 && cartridge.prgRom.byteLength !== 0x8000) {
    throw configurationError(cartridge, "PRG ROM must be 16 KiB or 32 KiB");
  }
  if (
    cartridge.chrMemoryBytes < 0x2000 ||
    cartridge.chrMemoryBytes > 0x8000 ||
    cartridge.chrMemoryBytes % 0x2000 !== 0
  ) {
    throw configurationError(cartridge, "CHR ROM must contain one to four 8 KiB banks");
  }
}

function requireCnromLayout(cartridge: Cartridge): void {
  if (cartridge.prgRom.byteLength !== 0x4000 && cartridge.prgRom.byteLength !== 0x8000) {
    throw configurationError(cartridge, "PRG ROM must be 16 KiB or 32 KiB");
  }
  if (
    cartridge.chrMemoryBytes < 0x2000 ||
    cartridge.chrMemoryBytes > 0x20_000 ||
    cartridge.chrMemoryBytes % 0x2000 !== 0
  ) {
    throw configurationError(cartridge, "CHR memory must contain one to sixteen 8 KiB banks");
  }
}

function requireVsSystemMapperLayout(cartridge: Cartridge): void {
  const prgBytes = cartridge.prgRom.byteLength;
  if (prgBytes < 0x2000 || prgBytes > 0xa000 || prgBytes % 0x2000 !== 0) {
    throw configurationError(
      cartridge,
      "Vs. System PRG ROM must contain one to five 8 KiB sockets",
    );
  }
  if (cartridge.chrRom.byteLength !== 0x2000 && cartridge.chrRom.byteLength !== 0x4000) {
    throw configurationError(cartridge, "Vs. System CHR ROM must contain one or two 8 KiB sockets");
  }
  if (
    cartridge.prgWritableBytes !== 0x0800 ||
    (cartridge.prgRamBytes > 0 && cartridge.prgNvRamBytes > 0)
  ) {
    throw configurationError(cartridge, "Vs. System mapper requires exactly 2 KiB of shared RAM");
  }
}

function requireSunsoft1Layout(cartridge: Cartridge): void {
  if (cartridge.prgRom.byteLength !== 0x8000) {
    throw configurationError(cartridge, "Sunsoft-1 PRG ROM must be 32 KiB");
  }
  if (cartridge.chrMemoryBytes !== 0x4000 && cartridge.chrMemoryBytes !== 0x8000) {
    throw configurationError(cartridge, "Sunsoft-1 CHR ROM must be 16 KiB or 32 KiB");
  }
}

function configurationError(
  cartridge: Cartridge,
  reason: string,
): UnsupportedMapperConfigurationError {
  return new UnsupportedMapperConfigurationError(
    cartridge.mapperNumber,
    cartridge.submapperNumber,
    reason,
  );
}

function formatSizes(sizes: readonly number[]): string {
  return sizes.map(formatBytes).join(" or ");
}

function formatBytes(bytes: number): string {
  return `${bytes / 1024} KiB`;
}
