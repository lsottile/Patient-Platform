import { PieLegal } from '../components/PieLegal';
import { VERSION_TERMINOS } from '../legal/versiones';

export function TerminosPage() {
  return (
    <div className="pagina-publica">
      <main className="documento-legal">
        <header className="documento-legal__cabecera">
          <p className="documento-legal__marca">Kine</p>
          <h1>Términos de Servicio</h1>
          <p className="tenue">Versión y vigencia: {VERSION_TERMINOS}</p>
        </header>

        <section>
          <h2>1. Quién presta el servicio</h2>
          <p>
            Kine es provisto por <strong>Luciano Sottile</strong>, CUIT <strong>20-41197971-8</strong>, con domicilio en
            Corrientes 886, Azul, Provincia de Buenos Aires, CP 7300, Argentina. El canal de contacto y soporte es{' '}
            <a href="mailto:lucianodsottile@gmail.com">lucianodsottile@gmail.com</a>.
          </p>
        </section>

        <section>
          <h2>2. Alcance y usuarios</h2>
          <p>
            Estos términos regulan el servicio alojado de Kine para profesionales y clínicas de Argentina. Quien crea o
            usa una cuenta declara ser mayor de edad y contar con capacidad para contratar y ejercer las actividades que
            registra en la plataforma.
          </p>
          <p>
            Kine es una herramienta tecnológica para organizar información. No es un dispositivo médico, no diagnostica,
            no prescribe y no reemplaza el criterio, la atención ni las obligaciones legales del profesional.
          </p>
        </section>

        <section>
          <h2>3. Responsabilidades profesionales</h2>
          <p>La persona usuaria es responsable de:</p>
          <ul>
            <li>mantener seguras sus credenciales y limitar el acceso a personal autorizado;</li>
            <li>contar con habilitación profesional y autorización válida para tratar datos de pacientes;</li>
            <li>la exactitud, pertinencia y actualización de la información registrada;</li>
            <li>cumplir el secreto profesional, la Ley 25.326, la Ley 26.529 y demás normas aplicables;</li>
            <li>revisar cualquier exportación antes de compartirla con terceros.</li>
          </ul>
        </section>

        <section>
          <h2>4. Precio, renovación y falta de pago</h2>
          <p>
            El precio aplicable se acuerda y paga por fuera de Kine. Kine no procesa pagos, no recibe dinero ni renueva
            cobros automáticamente. Una vez recibido el pago, el operador registra manualmente en Kine el mes abonado.
          </p>
          <p>
            Si el mes corriente no está registrado, Kine muestra un aviso de pago mensual pendiente durante los días 1 al
            10. Desde el día 11 la cuenta queda temporalmente bloqueada hasta que se registre el pago de ese mes. Durante el
            bloqueo se puede descargar un respaldo completo, consultar los documentos legales y cerrar sesión.
          </p>
        </section>

        <section>
          <h2>5. Cancelación, reintegros y soporte</h2>
          <p>
            La baja del servicio y el reintegro total del último pago pueden solicitarse dentro de los{' '}
            <strong>cinco días hábiles</strong> posteriores al pago escribiendo al correo de soporte. Las condiciones del
            reintegro se coordinan por el mismo medio externo utilizado para pagar.
          </p>
          <p>Las consultas de soporte reciben respuesta dentro de tres días hábiles.</p>
        </section>

        <section>
          <h2>6. Disponibilidad</h2>
          <p>
            Kine se ofrece según disponibilidad y puede requerir mantenimiento. No se garantiza funcionamiento
            ininterrumpido ni un nivel de servicio específico. Se aplican medidas razonables para reducir interrupciones y
            proteger la información, sin prometer ausencia absoluta de errores o incidentes.
          </p>
        </section>

        <section>
          <h2>7. Exportación, conservación y eliminación</h2>
          <p>
            La cuenta puede descargar un respaldo completo con sus datos y adjuntos, incluso si está bloqueada. La falta de
            pago no provoca la eliminación automática de datos. La eliminación puede solicitarse por correo y se atenderá
            cuando la identidad y las obligaciones legales aplicables hayan sido verificadas.
          </p>
          <div className="aviso aviso--aviso">
            <strong>Conservación profesional:</strong> la Ley 26.529 exige conservar la historia clínica durante al menos{' '}
            <strong>diez años</strong> desde la última actuación. El plazo de Kine no reemplaza esa obligación. Antes de que
            termine el acceso, el profesional debe exportar y custodiar una copia adecuada.
          </div>
          <p>
            Kine no puede borrar respaldos descargados, carpetas sincronizadas ni archivos del Google Drive controlado por
            la persona usuaria.
          </p>
        </section>

        <section>
          <h2>8. Código fuente y licencia</h2>
          <p>
            Kine se distribuye bajo la licencia AGPL-3.0. El enlace “Código fuente” permite obtener el código correspondiente
            a la versión desplegada. La licencia del software no transfiere la titularidad de los datos cargados por cada
            cuenta.
          </p>
        </section>

        <section>
          <h2>9. Cambios a estos términos</h2>
          <p>
            Los cambios materiales se informarán con al menos <strong>14 días corridos</strong> de anticipación. Si requieren
            una nueva aceptación, Kine la solicitará antes de continuar usando el servicio.
          </p>
        </section>

        <section>
          <h2>10. Ley aplicable</h2>
          <p>
            Se aplica la ley argentina. Toda controversia se someterá a la jurisdicción competente que corresponda, sin
            restringir derechos inderogables de consumidores, titulares de datos o pacientes.
          </p>
        </section>
      </main>
      <PieLegal />
    </div>
  );
}
