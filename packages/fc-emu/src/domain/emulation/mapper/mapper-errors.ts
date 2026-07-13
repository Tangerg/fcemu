export class UnsupportedMapperError extends Error {
  constructor(readonly mapperNumber: number) {
    super(`Unsupported cartridge mapper: ${mapperNumber}`);
    this.name = "UnsupportedMapperError";
  }
}

export class UnsupportedMapperVariantError extends Error {
  constructor(
    readonly mapperNumber: number,
    readonly submapperNumber: number,
  ) {
    super(`Unsupported cartridge mapper variant: ${mapperNumber}.${submapperNumber}`);
    this.name = "UnsupportedMapperVariantError";
  }
}

export class UnsupportedMapperConfigurationError extends Error {
  constructor(
    readonly mapperNumber: number,
    readonly submapperNumber: number,
    readonly reason: string,
  ) {
    super(`Unsupported mapper configuration ${mapperNumber}.${submapperNumber}: ${reason}`);
    this.name = "UnsupportedMapperConfigurationError";
  }
}
