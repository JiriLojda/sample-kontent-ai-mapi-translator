interface ObjectConstructor {
  keys<Keys>(obj: Readonly<Record<Keys, unknown>>): ReadonlyArray<Keys>;
}
