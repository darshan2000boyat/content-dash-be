import type { Schema, Struct } from '@strapi/strapi';

export interface BlocksFullWidthImage extends Struct.ComponentSchema {
  collectionName: 'components_blocks_full_width_images';
  info: {
    displayName: 'Full Width Image';
    icon: 'landscape';
  };
  attributes: {
    Image: Schema.Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    VideoURL: Schema.Attribute.String;
  };
}

export interface BlocksTwoColumnContentBlock extends Struct.ComponentSchema {
  collectionName: 'components_blocks_two_column_content_blocks';
  info: {
    description: '';
    displayName: 'Two Column Content Block';
    icon: 'bulletList';
  };
  attributes: {
    ContentLeft: Schema.Attribute.RichText &
      Schema.Attribute.CustomField<
        'plugin::ckeditor5.CKEditor',
        {
          preset: 'defaultHtml';
        }
      >;
    ContentRight: Schema.Attribute.RichText &
      Schema.Attribute.CustomField<
        'plugin::ckeditor5.CKEditor',
        {
          preset: 'defaultHtml';
        }
      >;
  };
}

export interface GlobalConfig extends Struct.ComponentSchema {
  collectionName: 'components_global_configs';
  info: {
    displayName: 'Config';
    icon: 'lock';
  };
  attributes: {
    ConfigKey: Schema.Attribute.String;
    ConfigValue: Schema.Attribute.Text;
  };
}

export interface GlobalFormAfterSubmission extends Struct.ComponentSchema {
  collectionName: 'components_global_form_after_submissions';
  info: {
    displayName: 'Form After Submission';
    icon: 'link';
  };
  attributes: {
    Link: Schema.Attribute.String;
    Message: Schema.Attribute.Text;
    Type: Schema.Attribute.Enumeration<['message', 'link']>;
  };
}

export interface GlobalFormEmailTemplates extends Struct.ComponentSchema {
  collectionName: 'components_global_form_email_templates';
  info: {
    displayName: 'Form Email Templates';
    icon: 'envelop';
  };
  attributes: {
    EmailSubject: Schema.Attribute.String;
    Enabled: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    RecipientEmail: Schema.Attribute.String;
    SenderEmail: Schema.Attribute.String;
  };
}

export interface GlobalFormFields extends Struct.ComponentSchema {
  collectionName: 'components_global_form_fields';
  info: {
    description: '';
    displayName: 'Form Fields';
    icon: 'bulletList';
  };
  attributes: {
    Label: Schema.Attribute.String;
    Mandatory: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    SelectOptions: Schema.Attribute.Component<
      'global.form-select-options',
      true
    >;
    SubmissionKey: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    Type: Schema.Attribute.Enumeration<
      [
        'text',
        'number',
        'email',
        'textarea',
        'select',
        'upload',
        'checkbox',
        'radio',
        'hidden',
        'phone',
        'country',
      ]
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'text'>;
    Validations: Schema.Attribute.Component<'global.form-validations', false>;
  };
}

export interface GlobalFormSelectOptions extends Struct.ComponentSchema {
  collectionName: 'components_global_form_select_options';
  info: {
    displayName: 'Form Select Options';
    icon: 'bulletList';
  };
  attributes: {
    Label: Schema.Attribute.String & Schema.Attribute.Required;
    SendToEmail: Schema.Attribute.String;
    Value: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface GlobalFormSubmissions extends Struct.ComponentSchema {
  collectionName: 'components_global_form_submissions';
  info: {
    description: '';
    displayName: 'Form Submissions';
    icon: 'information';
  };
  attributes: {
    Label: Schema.Attribute.String;
    SubmissionKey: Schema.Attribute.String;
    Type: Schema.Attribute.String;
    Value: Schema.Attribute.String;
  };
}

export interface GlobalFormValidations extends Struct.ComponentSchema {
  collectionName: 'components_global_form_validations';
  info: {
    displayName: 'Form Validations';
    icon: 'cursor';
  };
  attributes: {
    ErrorMessage: Schema.Attribute.String;
    MaxFiles: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          min: 1;
        },
        number
      > &
      Schema.Attribute.DefaultTo<1>;
  };
}

export interface GlobalSeo extends Struct.ComponentSchema {
  collectionName: 'components_global_seos';
  info: {
    description: '';
    displayName: 'SEO';
    icon: 'dashboard';
  };
  attributes: {
    MetaDescription: Schema.Attribute.Text;
    MetaImage: Schema.Attribute.Media<'images'>;
    MetaRobots: Schema.Attribute.String;
    MetaTitle: Schema.Attribute.String;
    StructuredData: Schema.Attribute.JSON;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'blocks.full-width-image': BlocksFullWidthImage;
      'blocks.two-column-content-block': BlocksTwoColumnContentBlock;
      'global.config': GlobalConfig;
      'global.form-after-submission': GlobalFormAfterSubmission;
      'global.form-email-templates': GlobalFormEmailTemplates;
      'global.form-fields': GlobalFormFields;
      'global.form-select-options': GlobalFormSelectOptions;
      'global.form-submissions': GlobalFormSubmissions;
      'global.form-validations': GlobalFormValidations;
      'global.seo': GlobalSeo;
    }
  }
}
