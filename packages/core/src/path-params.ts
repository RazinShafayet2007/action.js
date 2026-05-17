type PathParamName<TSegment extends string> = TSegment extends `:${infer TParam}` ? TParam : never;

type PathParamNames<TPath extends string> = TPath extends `${infer THead}/${infer TTail}`
  ? PathParamName<THead> | PathParamNames<TTail>
  : PathParamName<TPath>;

export type PathParams<TPath extends string> = [PathParamNames<TPath>] extends [never]
  ? Record<string, never>
  : {
      [TKey in PathParamNames<TPath>]: string;
    };
