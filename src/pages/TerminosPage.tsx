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
            El precio aplicable se muestra antes de contratar. La suscripción se cobra por adelantado cada mes en pesos
            argentinos mediante Mercado Pago y se renueva automáticamente hasta su cancelación. Mercado Pago puede
            reintentar cobros rechazados conforme a sus propias reglas.
          </p>
          <p>
            Ante una renovación rechazada, Kine mantiene el acceso completo durante cuatro días corridos desde el primer
            rechazo. Vencido ese plazo, la cuenta queda temporalmente bloqueada hasta que se confirme un pago. Durante el
            bloqueo se puede regularizar el pago, descargar un respaldo completo y cerrar sesión.
          </p>
        </section>

        <section>
          <h2>5. Cancelación, reintegros y soporte</h2>
          <p>
            La cancelación voluntaria evita renovaciones futuras y conserva el acceso hasta terminar el período ya pagado.
            El reintegro total del último cobro puede solicitarse dentro de los <strong>cinco días hábiles</strong>{' '}
            posteriores al pago escribiendo al correo de soporte. Cuando Mercado Pago confirma el reintegro, el acceso
            pagado termina.
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
            La cuenta puede descargar un respaldo completo con sus datos y adjuntos, incluso si está bloqueada. Kine
            conserva su copia durante <strong>un año</strong> desde el fin del acceso y luego puede eliminarla
            automáticamente sin un aviso por correo adicional. La eliminación anticipada puede solicitarse por correo y
            se atenderá cuando las obligaciones legales lo permitan.
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
