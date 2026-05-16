type GenericDecorator = ClassDecorator & MethodDecorator & PropertyDecorator;

function createNoopDecorator(): GenericDecorator {
  return (() => undefined) as unknown as GenericDecorator;
}

export function ApiBearerAuth(): GenericDecorator {
  return createNoopDecorator();
}

export function ApiTags(): GenericDecorator {
  return createNoopDecorator();
}

export function ApiOperation(): GenericDecorator {
  return createNoopDecorator();
}

export function ApiResponse(): GenericDecorator {
  return createNoopDecorator();
}

export function ApiBody(): GenericDecorator {
  return createNoopDecorator();
}

export function ApiProperty(): PropertyDecorator {
  return (() => undefined) as PropertyDecorator;
}

export class DocumentBuilder {
  setTitle(): this {
    return this;
  }

  setDescription(): this {
    return this;
  }

  setVersion(): this {
    return this;
  }

  addBearerAuth(): this {
    return this;
  }

  build(): Record<string, never> {
    return {};
  }
}

export const SwaggerModule = {
  createDocument(): Record<string, never> {
    return {};
  },
  setup(): void {
    return;
  },
};
