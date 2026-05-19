export interface DrizzleContext<TDb> {
  db: TDb;
}

export interface DrizzlePluginOptions<TDb> {
  db: TDb;
}
